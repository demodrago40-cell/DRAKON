
import smtplib
from email.mime.text import MIMEText
import os

# Configuration from your app.py
from app import Config
import os

CONTACT_EMAIL = Config.CONTACT_EMAIL
CONTACT_PASSWORD = Config.CONTACT_PASSWORD

def test_email():
    print(f"Attempting to send email as: {CONTACT_EMAIL}")
    print(f"Using password: {CONTACT_PASSWORD[:2]}...{CONTACT_PASSWORD[-2:]} (masked)")
    
    msg = MIMEText("This is a test email from the verification script.")
    msg['Subject'] = "Test Email"
    msg['From'] = CONTACT_EMAIL
    msg['To'] = CONTACT_EMAIL

    try:
        print("Connecting to smtp.gmail.com:465...")
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            print("Logging in...")
            server.login(CONTACT_EMAIL, CONTACT_PASSWORD)
            print("Login successful!")
            
            print("Sending email...")
            server.sendmail(CONTACT_EMAIL, CONTACT_EMAIL, msg.as_string())
            print("Email sent successfully!")
            return True
            
    except smtplib.SMTPAuthenticationError as e:
        print("\n❌ AUTHENTICATION ERROR!")
        print("Google refused the login. This usually means:")
        print("1. You are using your LOGIN password instead of an APP PASSWORD.")
        print("2. 2-Step Verification is not enabled.")
        print(f"Error details: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    test_email()
