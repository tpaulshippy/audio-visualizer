"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from backend.views import transcribe_audio, process_podcast_url, transcribe_podcast_file

urlpatterns = [
    path('admin/', admin.site.urls),
    path('transcribe/', transcribe_audio, name='transcribe_audio'),
    path('process_podcast_url/', process_podcast_url, name='process_podcast_url'),
    path('transcribe_podcast/', transcribe_podcast_file, name='transcribe_podcast_file'),
]

# Add URL pattern for serving media files during development
if settings.DEBUG:
    urlpatterns += static('/media/', document_root=settings.MEDIA_ROOT)
