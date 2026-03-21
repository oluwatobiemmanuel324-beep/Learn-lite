# HeyGen Video Agent API Integration

## Overview
The Learn Lite platform is now integrated with HeyGen's Video Agent API for generating AI-powered videos from text prompts. The implementation includes:
- Multi-language support (English, Spanish, French, Yoruba)
- Polling mechanism to wait for video completion
- Fuel deduction system
- Graceful fallback to sample videos if API key is not configured

## Setup Instructions

### 1. Get HeyGen API Key
1. Sign up or log in at: https://app.heygen.com
2. Navigate to Settings → API
3. Copy your API key
4. Add to `server/.env`:
   ```
   HEYGEN_API_KEY=your_api_key_here
   ```

### 2. Environment Configuration
The API key is already referenced in `server/.env.example`. Copy it to your `.env` file:
```bash
cd server
cp .env.example .env
# Edit .env and add your HEYGEN_API_KEY
```

### 3. Test the Integration
Make a POST request to `/api/videos/generate`:
```bash
curl -X POST http://localhost:4000/api/videos/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "A professional presenter explaining machine learning concepts",
    "language": "English"
  }'
```

## API Endpoint

### POST /api/videos/generate

#### Request Body
```json
{
  "prompt": "A presenter explaining machine learning",
  "language": "English"  // Optional: English, Spanish, French, or Yoruba
}
```

#### Response (Success)
```json
{
  "success": true,
  "message": "Video generated successfully",
  "videoUrl": "https://media.heygen.com/videos/...",
  "videoId": "abc123def456",
  "fuelRemaining": 45,
  "prompt": "A presenter explaining machine learning"
}
```

#### Response (Still Processing)
```json
{
  "success": false,
  "message": "Video generation in progress",
  "videoId": "abc123def456",
  "status": "processing",
  "fuelRemaining": 45
}
```

#### Response (Error)
```json
{
  "success": false,
  "error": "Error message describing the issue",
  "details": "Development mode only"
}
```

## Implementation Details

### How It Works

1. **Request Validation**
   - Checks if prompt is provided
   - Verifies user has sufficient fuel (≥ 1)
   - Validates authentication via JWT

2. **HeyGen API Call**
   - Sends prompt with language instruction to HeyGen
   - Receives `video_id` in response
   - Deducts 1 fuel immediately upon successful API request

3. **Polling for Completion**
   - Polls HeyGen status endpoint every 2 seconds
   - Maximum 30 attempts (60 seconds timeout)
   - Checks for `status: 'completed'` and retrieves `video_url`
   - Handles `status: 'failed'` gracefully

4. **Response**
   - Returns video URL if completed within timeout
   - Returns processing status if still generating
   - Client can retry polling using the `videoId`

### Enhanced Prompt
The prompt is automatically enhanced with language information:
```
Original: "A presenter explaining AI"
Enhanced: "A presenter explaining AI Please present this in Spanish language."
```

### Fuel Deduction
- **When**: Deducted after successful HeyGen API request (when video_id is received)
- **Amount**: 1 fuel per video generation
- **Refund**: If video fails after deduction, no refund is issued (cost of processing)

### Fallback Behavior
If `HEYGEN_API_KEY` is not configured:
- System logs a warning
- Returns sample video from `public/videos/sample-video.mp4`
- Still deducts fuel for consistency
- Allows development/testing without API key

### Error Handling

| Error | HTTP Status | Description |
|-------|------------|-------------|
| No prompt | 400 | Prompt is required |
| No fuel | 402 | Insufficient fuel |
| Auth failed | 401 | HeyGen API key invalid |
| Rate limited | 429 | HeyGen API rate limit hit |
| Timeout | 500 | Video generation took too long |
| Other errors | 500 | Server error |

### Logging
All operations are logged with prefixes for easy debugging:
```
[Video Generation] User 123 generating video for "..." in English
[HeyGen API] Initiating video generation for user 123
[HeyGen API] Received video_id: vid_abc123
⛽ Fuel deducted for user 123. Remaining: 45
[HeyGen Poll] Attempt 1/30: Status = processing
✅ Video completed for user 123: https://media.heygen.com/videos/...
```

## Frontend Integration

The frontend (`src/pages/VideoGenerator.jsx`) already has:
- Language dropdown (English, Spanish, French, Yoruba)
- Fuel balance display
- Video generation form
- Polling capability via the `videoId` response

The POST request automatically includes the selected language:
```javascript
{
  prompt: prompt.trim(),
  language: selectedLanguage  // "English", "Spanish", etc.
}
```

## Troubleshooting

### "HEYGEN_API_KEY not configured" warning
- **Cause**: API key not set in `.env`
- **Fix**: Add `HEYGEN_API_KEY=your_key_here` to `server/.env`
- **Workaround**: System uses sample videos if not configured

### "HeyGen API authentication failed" (401)
- **Cause**: Invalid or expired API key
- **Fix**: Verify key at https://app.heygen.com/settings/api

### "HeyGen API rate limit exceeded" (429)
- **Cause**: Too many requests in short time
- **Fix**: Wait a moment and retry. Consider implementing request queuing

### Polling timeout
- **Cause**: Video generation took > 60 seconds
- **Workaround**: Client can use returned `videoId` to manually poll later
- **Note**: Fuel already deducted when API request succeeded

### Video status stuck in "processing"
- **Cause**: HeyGen API is still processing
- **Fix**: Common for longer/complex prompts; client should retry later
- **Note**: You can manually check: `GET https://api.heygen.com/v1/video_agent/get_video?video_id=vid_xyz`

## API Limits & Considerations

### HeyGen Free Tier Limits (typical)
- 10 videos/month
- Maximum video length: 2 minutes
- Processing time: 2-5 minutes typically

### Production Recommendations
1. Implement database record for video requests (video_id, user_id, status, url, created_at)
2. Add background job to periodically check status of pending videos
3. Increase polling timeout for production (HeyGen may need more time for long videos)
4. Implement retry mechanism with exponential backoff
5. Cache completed videos to reduce API calls
6. Add analytics tracking for video generation metrics

## Related Files

- `server/index.js` - Lines 475-597: HeyGen API integration endpoint
- `server/.env.example` - HeyGen API configuration template
- `src/pages/VideoGenerator.jsx` - Frontend form and API calls
- `src/services/api.js` - Axios configuration with auth

## Next Steps

1. **Optional**: Implement webhook support to receive completion notifications instead of polling
2. **Optional**: Add video caching/storage to `public/videos/` directory
3. **Optional**: Create admin dashboard to view all generated videos
4. **Optional**: Implement CSV export of video generation analytics
5. **Consider**: Setting up scheduled jobs to clean up old temporary video IDs

