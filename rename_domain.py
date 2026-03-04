import os

directories = [r"C:\Users\phill\.gemini\antigravity\scratch\autograder"]

replacements = {
    "AutoGrader": "SmartGrader",
    "autograder": "smartgrader",
}

exclude_folders = [".git", ".next", "node_modules"]

for root, dirs, files in os.walk(directories[0]):
    dirs[:] = [d for d in dirs if d not in exclude_folders]
    for file in files:
        if file.endswith((".js", ".jsx", ".json", ".md", ".css")):
            path = os.path.join(root, file)
            # Skip package-lock.json to avoid sync issues with npm
            if file == "package-lock.json": continue

            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except UnicodeDecodeError:
                continue

            new_content = content
            # Apply replacements
            for key, val in replacements.items():
                new_content = new_content.replace(key, val)

            if new_content != content:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated {path}")
