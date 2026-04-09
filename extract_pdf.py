import sys
from pypdf import PdfReader

def extract_text(pdf_path, password):
    try:
        reader = PdfReader(pdf_path)
        if reader.is_encrypted:
            reader.decrypt(password)
        
        text = ""
        for i, page in enumerate(reader.pages):
            text += f"--- Page {i+1} ---\n"
            text += page.extract_text() + "\n\n"
            
        print(text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_text(sys.argv[1], sys.argv[2])
