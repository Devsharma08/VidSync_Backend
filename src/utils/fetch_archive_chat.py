import sys
import json
import os
import re
import subprocess
from chat_downloader import ChatDownloader

def parse_yt_dlp_chat(file_path):
    messages = []
    if not os.path.exists(file_path):
        return messages
        
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                action = data.get('replayChatItemAction', {})
                actions = action.get('actions', [])
                for act in actions:
                    add_chat = act.get('addChatItemAction', {})
                    item = add_chat.get('item', {})
                    renderer = item.get('liveChatTextMessageRenderer', {})
                    if not renderer:
                        continue
                    
                    # Extract message text from runs
                    message_text = ""
                    runs = renderer.get('message', {}).get('runs', [])
                    for run in runs:
                        if 'text' in run:
                            message_text += run['text']
                            
                    # Extract timestamp (microseconds to milliseconds)
                    timestamp_usec = renderer.get('timestampUsec')
                    timestamp = int(timestamp_usec) // 1000 if timestamp_usec else None
                    
                    # Time in video (seconds)
                    offset_msec = action.get('videoOffsetTimeMsec')
                    time_in_seconds = int(offset_msec) / 1000 if offset_msec else None
                    
                    # Author info
                    author = renderer.get('authorName', {}).get('simpleText')
                    author_id = renderer.get('authorExternalChannelId')
                    
                    # Check if streamer/owner
                    badges = renderer.get('authorBadges', [])
                    is_streamer = False
                    for badge in badges:
                        badge_renderer = badge.get('liveChatAuthorBadgeRenderer', {})
                        icon = badge_renderer.get('icon', {})
                        if icon.get('iconType') == 'OWNER':
                            is_streamer = True
                            break
                    
                    messages.append({
                        'timestamp': timestamp,
                        'time_in_video': time_in_seconds,
                        'author': author,
                        'message': message_text,
                        'is_streamer': is_streamer
                    })
            except Exception:
                continue
    return messages

def get_archived_chat_ytdlp(video_url):
    match = re.search(r'(?:v=|\/live\/|\/v\/|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})', video_url)
    if not match:
        raise Exception("Invalid video URL format for yt-dlp")
    video_id = match.group(1)
    
    # Run yt-dlp command
    temp_output_prefix = f"temp_chat_{video_id}"
    expected_file = f"{temp_output_prefix}.live_chat.json"
    
    if os.path.exists(expected_file):
        os.remove(expected_file)
        
    try:
        # Run yt-dlp using subprocess
        subprocess.run([
            "yt-dlp",
            "--write-subs",
            "--sub-langs", "live_chat",
            "--skip-download",
            "--output", temp_output_prefix,
            video_url
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        if not os.path.exists(expected_file):
            raise Exception("yt-dlp execution did not generate a live chat JSON file")
            
        return parse_yt_dlp_chat(expected_file)
    finally:
        if os.path.exists(expected_file):
            os.remove(expected_file)

def get_archived_chat(video_url):
    try:
        sys.stderr.write("Initializing chat-downloader...\n")
        sys.stderr.flush()
        # Try chat-downloader first
        downloader = ChatDownloader()
        chat = downloader.get_chat(video_url)
        
        messages = []
        count = 0
        for message in chat:
            count += 1
            if count % 100 == 0:
                sys.stderr.write(f"Parsed {count} messages...\n")
                sys.stderr.flush()
                
            is_streamer = 'owner' in message.get('author', {}).get('badges', [])
            
            messages.append({
                'timestamp': message.get('timestamp'),
                'time_in_video': message.get('time_in_seconds'),
                'author': message.get('author', {}).get('name'),
                'message': message.get('message'),
                'is_streamer': is_streamer
            })
            
        print(json.dumps(messages))
      
    except Exception as e:
        # If chat-downloader fails, fallback to yt-dlp
        try:
            messages = get_archived_chat_ytdlp(video_url)
            if messages:
                print(json.dumps(messages))
            else:
                print(json.dumps({"error": f"No chat logs retrieved. chat-downloader error: {str(e)}"}))
        except Exception as ytdlp_err:
            print(json.dumps({
                "error": f"Failed to retrieve chat using chat-downloader ({str(e)}) and yt-dlp ({str(ytdlp_err)})"
            }))

if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://www.youtube.com/watch?v=5qap5aO4i9A'
    get_archived_chat(url)