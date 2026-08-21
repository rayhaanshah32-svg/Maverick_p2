from extractor import extract_ppt


ppt_file = "test.pptx"

results = extract_ppt(ppt_file)


print()
print("TOTAL PARAGRAPHS:", len(results))
print()


for item in results:

    print("ID:", item["id"])
    print("SLIDE:", item["slide"])
    print("-" * 50)
    print(item["text"])
    print()