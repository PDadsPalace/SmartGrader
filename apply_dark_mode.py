import os
import re

directories = [
    r"C:\Users\phill\.gemini\antigravity\scratch\autograder\src\app",
]

replacements = {
    r"bg-white" : r"bg-white dark:bg-slate-950",
    r"bg-slate-50 " : r"bg-slate-50 dark:bg-slate-900 ",
    r'bg-slate-50"' : r'bg-slate-50 dark:bg-slate-900"',
    r"bg-slate-100 " : r"bg-slate-100 dark:bg-slate-800 ",
    r'bg-slate-100"' : r'bg-slate-100 dark:bg-slate-800"',
    r"hover:bg-slate-100" : r"hover:bg-slate-100 dark:hover:bg-slate-800",
    r"hover:bg-slate-200" : r"hover:bg-slate-200 dark:hover:bg-slate-700",
    r"border-slate-200" : r"border-slate-200 dark:border-slate-800",
    r"border-slate-100" : r"border-slate-100 dark:border-slate-800",
    r"border-slate-300" : r"border-slate-300 dark:border-slate-700",
    r"text-slate-900" : r"text-slate-900 dark:text-slate-50",
    r"text-slate-800" : r"text-slate-800 dark:text-slate-200",
    r"text-slate-700" : r"text-slate-700 dark:text-slate-300",
    r"text-slate-600" : r"text-slate-600 dark:text-slate-300",
    r"text-slate-500" : r"text-slate-500 dark:text-slate-400",
    r"text-indigo-900" : r"text-indigo-900 dark:text-indigo-300",
    r"text-indigo-800" : r"text-indigo-800 dark:text-indigo-300",
    r"text-indigo-700" : r"text-indigo-700 dark:text-indigo-400",
    r"text-indigo-600" : r"text-indigo-600 dark:text-indigo-400",
    r"bg-indigo-50 " : r"bg-indigo-50 dark:bg-indigo-900/40 ",
    r'bg-indigo-50"' : r'bg-indigo-50 dark:bg-indigo-900/40"',
    r"bg-indigo-100 " : r"bg-indigo-100 dark:bg-indigo-900/60 ",
    r'bg-indigo-100"' : r'bg-indigo-100 dark:bg-indigo-900/60"',
    r"bg-emerald-50 " : r"bg-emerald-50 dark:bg-emerald-900/40 ",
    r'bg-emerald-50"' : r'bg-emerald-50 dark:bg-emerald-900/40"',
    r"bg-emerald-100 " : r"bg-emerald-100 dark:bg-emerald-900/60 ",
    r'bg-emerald-100"' : r'bg-emerald-100 dark:bg-emerald-900/60"',
    r"border-emerald-100 " : r"border-emerald-100 dark:border-emerald-800 ",
    r'border-emerald-100"' : r'border-emerald-100 dark:border-emerald-800"',
    r"border-emerald-200 " : r"border-emerald-200 dark:border-emerald-800 ",
    r'border-emerald-200"' : r'border-emerald-200 dark:border-emerald-800"',
    r"text-emerald-800" : r"text-emerald-800 dark:text-emerald-400",
    r"text-emerald-700" : r"text-emerald-700 dark:text-emerald-400",
    r"text-emerald-600" : r"text-emerald-600 dark:text-emerald-400",
    r"text-red-700" : r"text-red-700 dark:text-red-400",
    r"bg-red-50 " : r"bg-red-50 dark:bg-red-900/30 ",
    r'bg-red-50"' : r'bg-red-50 dark:bg-red-900/30"',
    r"border-red-200 " : r"border-red-200 dark:border-red-800 ",
    r'border-red-200"' : r'border-red-200 dark:border-red-800"',
}

exclude_files = ["globals.css", "layout.js", "Providers.jsx"]

for root, _, files in os.walk(directories[0]):
    for file in files:
        if file.endswith(".js") or file.endswith(".jsx"):
            if file in exclude_files:
                continue
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            new_content = content
            for key, val in replacements.items():
                new_content = new_content.replace(key, val)

            if new_content != content:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated {path}")
