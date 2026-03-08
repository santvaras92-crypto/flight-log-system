#!/usr/bin/env python3
"""Fix: Move useRef hooks and helpers out of renderCard to component level."""

filepath = 'app/admin/dashboard/ui/DashboardClient.tsx'

with open(filepath, 'r') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find renderCard start
render_card_start = None
for i, line in enumerate(lines):
    if '// Render individual metric card with drag-and-drop' in line:
        render_card_start = i
        break

if render_card_start is None:
    print("ERROR: Could not find renderCard comment")
    exit(1)

print(f"Found renderCard comment at line {render_card_start + 1}")

# Find "return (" inside renderCard
return_line = None
for i in range(render_card_start, min(render_card_start + 100, len(lines))):
    if lines[i].strip() == 'return (':
        return_line = i
        break

if return_line is None:
    print("ERROR: Could not find 'return (' inside renderCard")
    exit(1)

print(f"Found 'return (' at line {return_line + 1}")

# Build the new block
new_block = [
    '  // --- Robust drag state (must be at component top level, NOT inside renderCard) ---\n',
    '  const dragActivatedRef = useRef(false);\n',
    '  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);\n',
    '\n',
    '  // --- Scroll lock helpers ---\n',
    '  const lockScroll = () => {\n',
    '    document.body.style.overflow = \'hidden\';\n',
    '    const grid = document.getElementById(\'overview-grid\');\n',
    '    if (grid) grid.style.touchAction = \'none\';\n',
    '  };\n',
    '  const unlockScroll = () => {\n',
    '    document.body.style.overflow = \'\';\n',
    '    const grid = document.getElementById(\'overview-grid\');\n',
    '    if (grid) grid.style.touchAction = \'\';\n',
    '  };\n',
    '\n',
    '  // --- Long press drag handlers ---\n',
    '  const handleTouchStartLongPress = (e: React.TouchEvent, cardId: string) => {\n',
    '    dragActivatedRef.current = false;\n',
    '    longPressTimeoutRef.current = setTimeout(() => {\n',
    '      dragActivatedRef.current = true;\n',
    '      lockScroll();\n',
    '      handleDragStart(cardId);\n',
    '    }, 400);\n',
    '  };\n',
    '  const handleTouchMoveLongPress = (e: React.TouchEvent) => {\n',
    '    if (!dragActivatedRef.current && longPressTimeoutRef.current) {\n',
    '      clearTimeout(longPressTimeoutRef.current);\n',
    '      longPressTimeoutRef.current = null;\n',
    '    }\n',
    '    if (dragActivatedRef.current) {\n',
    '      e.preventDefault(); // Bloquea scroll nativo\n',
    '      handleTouchMove(e);\n',
    '    }\n',
    '  };\n',
    '  const handleTouchEndLongPress = (e: React.TouchEvent, cardId: string) => {\n',
    '    if (longPressTimeoutRef.current) {\n',
    '      clearTimeout(longPressTimeoutRef.current);\n',
    '      longPressTimeoutRef.current = null;\n',
    '    }\n',
    '    if (dragActivatedRef.current) {\n',
    '      unlockScroll();\n',
    '      handleDragEnd();\n',
    '    } else {\n',
    '      handleTouchEnd(e, cardId);\n',
    '    }\n',
    '    dragActivatedRef.current = false;\n',
    '  };\n',
    '\n',
    '  // Render individual metric card with drag-and-drop\n',
    '  const renderCard = (cardId: string, content: JSX.Element) => {\n',
    '    const isDragging = draggedCard === cardId;\n',
    '    const isComplexCard = cardId === \'nextInspections\' || cardId === \'activePilots\';\n',
    '\n',
]

# Replace: from render_card_start to return_line (exclusive), put new_block
# The old block is from render_card_start to return_line (inclusive of return line - no, return stays)
# We want to replace lines[render_card_start : return_line] with new_block
old_section = lines[render_card_start:return_line]
print(f"\n--- OLD SECTION (lines {render_card_start+1} to {return_line}) ---")
for i, line in enumerate(old_section):
    print(f"  {render_card_start+1+i}: {line.rstrip()}")

print(f"\n--- NEW SECTION ---")
for line in new_block:
    print(f"  {line.rstrip()}")

# Do the replacement
new_lines = lines[:render_card_start] + new_block + lines[return_line:]

with open(filepath, 'w') as f:
    f.writelines(new_lines)

print(f"\nSUCCESS! File updated. New total lines: {len(new_lines)}")
print(f"Replaced {len(old_section)} lines with {len(new_block)} lines")
