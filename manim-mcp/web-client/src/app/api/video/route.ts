import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoPath = searchParams.get('path');

    if (!videoPath) {
      return NextResponse.json({ error: 'No video path provided' }, { status: 400 });
    }

    // Security: Ensure the path is within the server media directory
    const serverMediaPath = join(process.cwd(), '../server/media/videos');
    const fullPath = join(serverMediaPath, videoPath);

    // Check if file exists
    const stats = await stat(fullPath);
    
    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }

    // Read the video file
    const videoBuffer = await readFile(fullPath);

    // Return video with proper headers for streaming
    return new NextResponse(new Uint8Array(videoBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stats.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error serving video:', error);
    return NextResponse.json(
      { error: 'Video not found or error reading file' },
      { status: 404 }
    );
  }
}

