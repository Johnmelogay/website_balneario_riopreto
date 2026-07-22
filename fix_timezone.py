import os
import re

directory = '/Users/joaomelo/website_riopreto'

# regex to find .toLocaleTimeString('pt-BR') and .toLocaleDateString('pt-BR')
# Case 1: toLocaleTimeString('pt-BR')  -> toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho' })
# Case 2: toLocaleTimeString('pt-BR', { ... }) -> toLocaleTimeString('pt-BR', { timeZone: 'America/Porto_Velho', ... })

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Case 2: with options dict
    content = re.sub(
        r"(toLocale(?:Time|Date)String\s*\(\s*['\"]pt-BR['\"]\s*,\s*\{)",
        r"\1 timeZone: 'America/Porto_Velho', ",
        content
    )
    
    # Case 1: without options dict
    content = re.sub(
        r"(toLocale(?:Time|Date)String\s*\(\s*['\"]pt-BR['\"]\s*)\)",
        r"\1, { timeZone: 'America/Porto_Velho' })",
        content
    )
    
    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.js') or file.endswith('.html'):
            process_file(os.path.join(root, file))
