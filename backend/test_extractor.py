from extractor import extract_pdf


pdf_file = "test.pdf"

results = extract_pdf(pdf_file)


print()
print("TOTAL PARAGRAPHS:", len(results))
print()


for item in results:

    print("ID:", item["id"])
    print("PAGE:", item["page"])
    print("-" * 50)
    print(item["text"])
    print()