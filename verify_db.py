import sqlite3
import os

db_path = 'drakon.db'

if not os.path.exists(db_path):
    print(f"❌ Database file '{db_path}' NOT found.")
    exit(1)

print(f"✅ Database file '{db_path}' found.")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check Chats
    cursor.execute("SELECT count(*) FROM chats")
    chat_count = cursor.fetchone()[0]
    print(f"\n📊 Total Chats: {chat_count}")
    
    if chat_count > 0:
        print("   Last 3 Chats:")
        cursor.execute("SELECT id, title, updated_at FROM chats ORDER BY updated_at DESC LIMIT 3")
        for row in cursor.fetchall():
            print(f"   - [{row[2]}] {row[1]} (ID: {row[0]})")

    # Check Messages
    cursor.execute("SELECT count(*) FROM messages")
    msg_count = cursor.fetchone()[0]
    print(f"\n💬 Total Messages: {msg_count}")
    
    if msg_count > 0:
        print("   Last 3 Messages:")
        cursor.execute("SELECT role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 3")
        for row in cursor.fetchall():
            content_preview = (row[1][:50] + '..') if len(row[1]) > 50 else row[1]
            print(f"   - [{row[2]}] {row[0]}: {content_preview}")

    conn.close()

except Exception as e:
    print(f"❌ Error querying database: {e}")
