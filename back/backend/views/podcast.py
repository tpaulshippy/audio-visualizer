"""
Views related to podcast URL processing functionality.
"""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import os
import json
import time
import subprocess
import requests
import re

# Create media directory if it doesn't exist
MEDIA_ROOT = os.path.join(settings.BASE_DIR, 'media')
os.makedirs(MEDIA_ROOT, exist_ok=True)

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
                "file_path": audio_path,
                "file_name": file_name,
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