import requests
import fitz

# create PDF
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello world, this is a perfect PDF. The magic word is SHAZAM.")
pdf_bytes = doc.write()

session = requests.Session()
res = session.post("http://127.0.0.1:5000/chat", files={"files": ("test.pdf", pdf_bytes, "application/pdf")}, data={"message": "What is the magic word?"})
print(res.text)
