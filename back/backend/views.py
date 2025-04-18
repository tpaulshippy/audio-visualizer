from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
import os
import tempfile
import whisper
import json
import time
import ffmpeg
import requests
import re
import subprocess
from urllib.parse import urlparse
from typing import Iterator, Optional
from django.conf import settings
from django.core.files.storage import FileSystemStorage

# Create media directory if it doesn't exist
MEDIA_ROOT = os.path.join(settings.BASE_DIR, 'media')
os.makedirs(MEDIA_ROOT, exist_ok=True)

# Create a file storage instance
fs = FileSystemStorage(location=MEDIA_ROOT)

@csrf_exempt
def transcribe_audio(request):
    if request.method == 'POST' and request.FILES.get('audio_file'):
        audio_file = request.FILES['audio_file']
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(audio_file.name)[1]) as temp_file:
            # Write uploaded file content to the temp file
            for chunk in audio_file.chunks():
                temp_file.write(chunk)
            temp_path = temp_file.name
        
        try:
            # Use StreamingHttpResponse to send chunks of transcription as they're processed
            response = StreamingHttpResponse(
                streaming_transcribe(temp_path),
                content_type='text/event-stream'
            )
            response["Cache-Control"] = "no-cache"
            response["X-Accel-Buffering"] = "no"
            return response
        except Exception as e:
            # Clean up the temporary file if there's an error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            # If there's an error, return the error message
            return JsonResponse({"error": f"Error transcribing audio: {str(e)}"}, status=500)
    return JsonResponse({"error": "Invalid request."}, status=400)

def streaming_transcribe(audio_path: str) -> Iterator[str]:
    """Stream audio transcription in chunks."""
    
    # Load Whisper model (using the smallest model for speed)
    model = whisper.load_model("tiny")
    
    try:
        # Get audio duration using ffprobe
        probe = ffmpeg.probe(audio_path)
        duration = float(probe['format']['duration'])
        
        # Define chunk size in seconds (e.g., process 30 seconds at a time)
        chunk_duration = 30
        total_chunks = int(duration / chunk_duration) + 1
        
        # Process audio in chunks
        for i in range(total_chunks):
            start_time = i * chunk_duration
            end_time = min(start_time + chunk_duration, duration)
            
            # Skip processing if this is the last chunk and it's too short
            if end_time - start_time < 1.0 and i > 0:
                continue
            
            try:
                # Extract audio segment using ffmpeg
                segment_path = f"{audio_path}_segment_{i}.wav"
                (
                    ffmpeg
                    .input(audio_path, ss=start_time, to=end_time)
                    .output(segment_path)
                    .run(quiet=True, overwrite_output=True)
                )
                
                # Transcribe the segment
                result = model.transcribe(
                    segment_path, 
                    word_timestamps=True,
                )
                
                # Adjust segment timestamps to account for the overall position in the audio
                segments = []
                for segment in result["segments"]:
                    adjusted_segment = {
                        "id": f"{i}-{segment['id']}",  # Make IDs unique across chunks
                        "text": segment["text"],
                        "start": segment["start"] + start_time,
                        "end": segment["end"] + start_time
                    }
                    
                    # Include word-level timestamps if available
                    if "words" in segment and segment["words"]:
                        adjusted_segment["words"] = [
                            {
                                "word": word.get("word", ""),
                                "start": word.get("start", 0) + start_time,
                                "end": word.get("end", 0) + start_time
                            } 
                            for word in segment["words"]
                        ]
                    segments.append(adjusted_segment)
                
                # Clean up the temporary segment file
                if os.path.exists(segment_path):
                    os.remove(segment_path)
                
                # Create response with chunk info and segments
                chunk_response = {
                    "chunk_id": i,
                    "total_chunks": total_chunks,
                    "chunk_text": result["text"],
                    "segments": segments,
                    "is_final": (i == total_chunks - 1)
                }
                
                # Yield the chunk data as a Server-Sent Event
                yield f"data: {json.dumps(chunk_response)}\n\n"
                
            except Exception as e:
                # Return error for this chunk
                error_msg = f"Error processing chunk {i}: {str(e)}"
                yield f"data: {json.dumps({'error': error_msg})}\n\n"
                
    except Exception as e:
        # Return error as event
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        # Clean up the temporary file
        if os.path.exists(audio_path):
            os.remove(audio_path)

@csrf_exempt
def process_podcast_url(request):
    """Process a podcast URL and return a URL to the downloaded audio file."""
    if request.method == 'POST':
        try:
            # Parse request data
            data = json.loads(request.body)
            podcast_url = data.get('podcast_url')
            
            if not podcast_url:
                return JsonResponse({"error": "No podcast URL provided"}, status=400)
            
            # Download the audio using youtube-dl or yt-dlp (which can handle podcast platforms too)
            audio_path = download_podcast_audio(podcast_url)
            
            # Get the URL path to the downloaded file
            file_name = os.path.basename(audio_path)
            file_url = f"/media/{file_name}"
            
            # Get podcast metadata if available
            metadata = extract_podcast_metadata(podcast_url)
            
            return JsonResponse({
                "audio_url": file_url,
                "metadata": metadata
            })
            
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)

def download_podcast_audio(url):
    """Download audio from podcast URL using youtube-dl or yt-dlp."""
    try:
        # Create a temporary filename with random suffix
        random_suffix = str(int(time.time()))
        output_path = os.path.join(MEDIA_ROOT, f"podcast_{random_suffix}.mp3")
        
        # Try using yt-dlp first (newer and generally more reliable)
        try:
            subprocess.run([
                'yt-dlp',
                '-x',  # Extract audio
                '--audio-format', 'mp3',
                '--audio-quality', '0',  # Best quality
                '-o', output_path,
                url
            ], check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            # Fall back to youtube-dl if yt-dlp is not available or fails
            subprocess.run([
                'youtube-dl',
                '-x',  # Extract audio
                '--audio-format', 'mp3',
                '--audio-quality', '0',  # Best quality
                '-o', output_path,
                url
            ], check=True)
        
        # Check if file exists and return the path
        if os.path.exists(output_path):
            return output_path
        else:
            raise Exception("Failed to download podcast audio")
    
    except Exception as e:
        raise Exception(f"Error downloading podcast: {str(e)}")

def extract_podcast_metadata(url):
    """Extract metadata from podcast URL."""
    metadata = {
        "title": None,
        "publisher": None,
        "episode": None
    }
    
    # Extract information from Apple Podcasts URLs
    if "podcasts.apple.com" in url:
        try:
            # Make a request to the URL
            response = requests.get(url)
            if response.status_code == 200:
                # Extract title from HTML
                title_match = re.search(r'<title>(.*?)</title>', response.text)
                if title_match:
                    title_parts = title_match.group(1).split(' - ')
                    if len(title_parts) >= 2:
                        metadata["episode"] = title_parts[0]
                        metadata["title"] = title_parts[1]
                        if len(title_parts) >= 3:
                            metadata["publisher"] = title_parts[2]
        except:
            # If extraction fails, just continue with empty metadata
            pass
    
    return metadata