# Audio Visualizer

A modern web application that transforms spoken audio into synchronized text transcriptions with AI-generated visual descriptions.


## 🌟 Features

- **Real-time Audio Transcription**: Convert spoken words to text using OpenAI's Whisper model
- **Synchronized Text Display**: View transcriptions that animate in sync with audio playback
- **AI Visual Descriptions**: Experience generated visual descriptions that represent the content
- **Streaming Architecture**: Process audio in chunks for a responsive experience
- **Intuitive Interface**: Simple and elegant design for easy interaction

## 🚀 Getting Started

### Prerequisites

- Python 3.10+ for the backend
- Node.js 18+ for the frontend
- [Whisper](https://github.com/openai/whisper) for speech-to-text
- [Ollama](https://ollama.com/) with LLaMA3 model for visual descriptions

### Installation

#### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd back
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install required packages:
   ```bash
   pip install django django-cors-headers openai-whisper ffmpeg-python
   ```

4. Start the Django server:
   ```bash
   python manage.py runserver
   ```

#### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd front
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

#### Ollama Setup (for Visual Descriptions)

1. [Install Ollama](https://ollama.com/download)
2. Pull the LLaMA3 model:
   ```bash
   ollama pull llama3
   ```
3. Ensure the Ollama service is running at `http://localhost:11434`

## 🎯 How to Use

1. Open the application in your web browser (typically at http://localhost:5173)
2. Click on "Choose Audio File" to upload an audio recording
3. Wait for the transcription process to begin
4. Watch as the text appears synchronized with the audio playback
5. Experience AI-generated visual descriptions that represent the content

## 🔧 Architecture

The application is structured with:

- **Frontend**: React with Vite for a fast and responsive UI
- **Backend**: Django for robust server-side processing
- **Speech-to-Text**: OpenAI's Whisper model for high-quality transcription
- **Visual Descriptions**: LLaMA3 through Ollama for generating descriptive imagery

## 🔄 How It Works

1. Audio is uploaded from the client to the Django backend
2. The backend processes the audio in chunks using Whisper
3. Transcription results are streamed back to the frontend
4. Each chunk is sent to Ollama for visual description generation
5. The frontend synchronizes the display with audio playback
6. Visual descriptions update as the audio progresses

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🌐 Future Enhancements

- Multiple language support
- Custom visual styling options
- User accounts for saving and sharing transcriptions
- Integration with stable diffusion for actual image generation
- Mobile application support