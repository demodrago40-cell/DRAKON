from app import app, db, Chat, Message
import logging

# Disable imported logging setup to keep output clean
logging.getLogger().setLevel(logging.CRITICAL)

def inspect():
    with app.app_context():
        print("--- Chats ---")
        chats = Chat.query.all()
        for c in chats:
            msg_count = Message.query.filter_by(chat_id=c.id).count()
            print(f"Chat ID: '{c.id}'")
            print(f"Title: '{c.title}'")
            print(f"User: '{c.user_id}'")
            print(f"Msgs: {msg_count}")
            
            # Print first few messages to check roles
            msgs = Message.query.filter_by(chat_id=c.id).order_by(Message.created_at).all()
            for m in msgs:
                print(f"  - [{m.role}] {m.content[:20]}...")

            # Try adding a test message
            try:
                print("Attempting to add a test message...")
                test_msg = Message(chat_id=c.id, role='user', content='test_db_insert')
                db.session.add(test_msg)
                db.session.commit()
                print("Successfully added test message.")
            except Exception as e:
                print(f"Failed to add test message: {e}")
                db.session.rollback()

if __name__ == "__main__":
    inspect()
