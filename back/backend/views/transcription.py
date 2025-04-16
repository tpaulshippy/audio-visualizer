"""
Views related to audio transcription functionality.
"""
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
import os
import tempfile
import whisper
import json
import ffmpeg
from typing import Iterator

@csrf_exempt
def transcribe_audio(request):
    """Handle audio file upload and initiate transcription."""
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

@csrf_exempt
def transcribe_podcast_file(request):
    """Handle transcription for already downloaded podcast files."""
    if request.method == 'POST':
        try:
            # Parse request data
            data = json.loads(request.body)
            file_path = data.get('file_path')
            
            if not file_path or not os.path.exists(file_path):
                return JsonResponse({"error": "File not found"}, status=404)
            
            # Use StreamingHttpResponse to send chunks of transcription as they're processed
            response = StreamingHttpResponse(
                streaming_transcribe(file_path, delete_on_complete=False),
                content_type='text/event-stream'
            )
            response["Cache-Control"] = "no-cache"
            response["X-Accel-Buffering"] = "no"
            return response
            
        except Exception as e:
            return JsonResponse({"error": f"Error transcribing podcast: {str(e)}"}, status=500)
    return JsonResponse({"error": "Invalid request."}, status=400)

def streaming_transcribe(audio_path: str, delete_on_complete=True) -> Iterator[str]:
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
        # Clean up the temporary file if requested
        if delete_on_complete and os.path.exists(audio_path):
            os.remove(audio_path)