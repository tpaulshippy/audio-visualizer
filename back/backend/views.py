from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
import os
import tempfile
import whisper

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
            # Load Whisper model (using the smallest model for speed)
            model = whisper.load_model("tiny")
            
            # Transcribe the audio file
            result = model.transcribe(temp_path)
            transcription = result["text"]
        except Exception as e:
            # If there's an error with Whisper, return the error message
            transcription = f"Error transcribing audio: {str(e)}"
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
        return JsonResponse({"transcription": transcription})
    return JsonResponse({"error": "Invalid request."}, status=400)