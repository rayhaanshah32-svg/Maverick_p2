from extractor import extract_text


def test_file(file_path):
    print("\n" + "=" * 70)
    print("FILE:", file_path)
    print("=" * 70)

    try:
        text = extract_text(file_path)

        if text:
            print("\nEXTRACTED TEXT:\n")
            print(text)
        else:
            print("\nNo text was detected.")

    except Exception as e:
        print("\nERROR:")
        print(e)


# Test PDF
test_file("test.pdf")

# Test PowerPoint
test_file("test.pptx")

# Test Image
test_file("test.jpg")