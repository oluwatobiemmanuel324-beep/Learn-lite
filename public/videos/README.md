# Videos Directory

This folder contains generated video files.

## Usage

Place generated video files here. The backend serves them via:
- URL: `http://localhost:4000/videos/<filename>.mp4`

## Sample Video

To test video playback:
1. Download any sample .mp4 video
2. Rename it to `sample-video.mp4`
3. Place it in this directory
4. The video generator will use this file for testing

## Production

In production, integrate with:
- HeyGen API (https://www.heygen.com/)
- D-ID API (https://www.d-id.com/)
- Synthesia API (https://www.synthesia.io/)
- Or any other AI video generation service

Generated videos should be saved here with unique filenames.
