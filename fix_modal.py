with open('sistema_mods_3.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '<div class="modal-box anim-fade p-0 overflow-hidden max-w-lg">',
    '<div class="modal-box anim-fade p-0 overflow-hidden max-w-lg flex flex-col max-h-[95vh]">'
)

content = content.replace(
    '<div class="p-6 bg-white space-y-4 max-h-[75vh] overflow-y-auto">',
    '<div class="p-6 bg-white space-y-4 overflow-y-auto flex-1 min-h-0">'
)

with open('sistema_mods_3.js', 'w', encoding='utf-8') as f:
    f.write(content)

