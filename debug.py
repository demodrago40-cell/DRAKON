import app
import json
with app.app.app_context():
    chat = app.Chat.query.order_by(app.Chat.updated_at.desc()).first()
    msgs = [{'role': m.role, 'content': m.content} for m in chat.messages] if chat else []
    with open('debug_chat.json', 'w') as f:
        json.dump(msgs, f, indent=2)
