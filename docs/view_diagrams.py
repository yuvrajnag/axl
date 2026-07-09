"""
AXL Diagram Viewer — Native Desktop Window
"""

import sys
import os
import argparse
import subprocess


def read_mmd(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def generate_from_verify_script(project_root: str) -> tuple[str, str]:
    result = subprocess.run(
        ["npx", "tsx", "test-backend/verify-diagram-generator.ts"],
        cwd=project_root,
        capture_output=True,
        text=True,
        shell=True,
    )
    output = result.stdout
    flow_content = ""
    er_content = ""

    sections = output.split("FILE: ")
    for section in sections:
        if section.startswith("docs/system-flow.mmd"):
            lines = section.split("\n")
            content_lines = []
            started = False
            for line in lines:
                if line.strip().startswith("="):
                    if started:
                        break
                    started = True
                    continue
                if started:
                    content_lines.append(line)
            flow_content = "\n".join(content_lines).strip()
        elif section.startswith("docs/schema.mmd"):
            lines = section.split("\n")
            content_lines = []
            started = False
            for line in lines:
                if line.strip().startswith("="):
                    if started:
                        break
                    started = True
                    continue
                if started:
                    content_lines.append(line)
            er_content = "\n".join(content_lines).strip()

    return flow_content, er_content


def build_html(flow_mmd: str, er_mmd: str) -> str:
    flow_safe = flow_mmd.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    er_safe = er_mmd.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AXL Diagrams</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');

    * {{ margin: 0; padding: 0; box-sizing: border-box; }}

    body {{
      font-family: 'Inter', sans-serif;
      background: #fafafa;
      color: #111;
      height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }}

    /* ── top header ── */
    .header {{
      text-align: center;
      padding: 1.4rem 1rem 0.8rem;
      border-bottom: 1px solid #e4e4e4;
      background: #fff;
    }}

    .file-name {{
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.78rem;
      font-weight: 500;
      color: #888;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }}

    .file-name .dot {{
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #111;
      display: inline-block;
    }}

    .diagram-title {{
      font-size: 1.15rem;
      font-weight: 600;
      color: #111;
      margin-bottom: 0.25rem;
      letter-spacing: -0.01em;
    }}

    .diagram-desc {{
      font-size: 0.78rem;
      font-weight: 300;
      color: #999;
      max-width: 500px;
      margin: 0 auto;
      line-height: 1.4;
    }}

    /* ── diagram area ── */
    .diagram-area {{
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      background: #fafafa;
    }}

    .diagram-panel {{
      display: none;
      width: 100%;
      justify-content: center;
      align-items: center;
    }}

    .diagram-panel.visible {{
      display: flex;
    }}

    .diagram-panel svg {{
      max-width: 100%;
      height: auto;
    }}

    /* ── bottom buttons ── */
    .button-bar {{
      display: flex;
      justify-content: center;
      gap: 0;
      padding: 0.9rem;
      border-top: 1px solid #e4e4e4;
      background: #fff;
    }}

    .tab-btn {{
      padding: 0.55rem 2.2rem;
      border: 2px solid #111;
      background: #fff;
      color: #111;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      transition: background 0.2s, color 0.2s;
      outline: none;
      border-radius: 0;
    }}

    .tab-btn + .tab-btn {{
      border-left: none;
    }}

    .tab-btn:hover {{
      background: #f0f0f0;
    }}

    .tab-btn.active {{
      background: #111;
      color: #fff;
    }}
  </style>
</head>
<body>

  <!-- Header: changes based on active tab -->
  <div class="header">
    <div class="file-name">
      <span class="dot"></span>
      <span id="header-file">workflows.flow</span>
    </div>
    <div class="diagram-title" id="header-title">System Workflow</div>
    <div class="diagram-desc" id="header-desc">Action pipeline with permission gates — shows how steps flow through public, authenticated, and OTP-verified actions</div>
  </div>

  <!-- Diagram area: centered -->
  <div class="diagram-area">
    <div id="tab-flow" class="diagram-panel visible"></div>
    <div id="tab-er" class="diagram-panel"></div>
  </div>

  <!-- Buttons: bottom center, sharp, black & white -->
  <div class="button-bar">
    <button class="tab-btn active" onclick="showTab('flow', this)">SYSTEM FLOW</button>
    <button class="tab-btn" onclick="showTab('er', this)">ER DIAGRAM</button>
  </div>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    mermaid.initialize({{
      startOnLoad: false,
      theme: 'base',
      themeVariables: {{
        primaryColor: '#ffffff',
        primaryTextColor: '#111111',
        primaryBorderColor: '#333333',
        lineColor: '#333333',
        secondaryColor: '#f7f7f7',
        tertiaryColor: '#f0f0f0',
        mainBkg: '#ffffff',
        nodeBorder: '#333333',
        clusterBkg: '#fafafa',
        clusterBorder: '#cccccc',
        edgeLabelBackground: '#fafafa',
        fontSize: '13px',
        fontFamily: 'Inter, sans-serif',
      }},
    }});

    const flowDef = `{flow_safe}`;
    const erDef = `{er_safe}`;

    async function renderDiagram(id, definition) {{
      try {{
        const {{ svg }} = await mermaid.render(id + '_svg', definition);
        document.getElementById(id).innerHTML = svg;
      }} catch (e) {{
        document.getElementById(id).innerHTML =
          '<p style="color:#c00;padding:1rem;font-size:0.85rem;">Render error: ' + e.message + '</p>';
      }}
    }}

    await renderDiagram('tab-flow', flowDef);
    await renderDiagram('tab-er', erDef);
  </script>

  <script>
    const tabMeta = {{
      flow: {{
        file: 'workflows.flow',
        title: 'System Workflow',
        desc: 'Action pipeline with permission gates — shows how steps flow through public, authenticated, and OTP-verified actions'
      }},
      er: {{
        file: 'schema.flow',
        title: 'Entity-Relationship Diagram',
        desc: 'Data model showing entities and their relationships — inferred from field types across the schema definition'
      }}
    }};

    function showTab(tab, btn) {{
      document.querySelectorAll('.diagram-panel').forEach(c => c.classList.remove('visible'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('visible');
      btn.classList.add('active');

      const meta = tabMeta[tab];
      document.getElementById('header-file').textContent = meta.file;
      document.getElementById('header-title').textContent = meta.title;
      document.getElementById('header-desc').textContent = meta.desc;
    }}
  </script>

</body>
</html>'''


def main():
    parser = argparse.ArgumentParser(description="AXL Diagram Viewer")
    parser.add_argument("--flow", help="Path to system-flow.mmd file")
    parser.add_argument("--er", help="Path to schema.mmd file")
    parser.add_argument("--width", type=int, default=1100, help="Window width")
    parser.add_argument("--height", type=int, default=750, help="Window height")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    if args.flow and args.er:
        flow_mmd = read_mmd(args.flow)
        er_mmd = read_mmd(args.er)
    else:
        print("Generating diagrams...")
        flow_mmd, er_mmd = generate_from_verify_script(project_root)

    if not flow_mmd or not er_mmd:
        flow_mmd = flow_mmd or 'flowchart TD\\n  A["No data"]'
        er_mmd = er_mmd or 'erDiagram\\n  EMPTY {\\n    String message\\n  }'

    html = build_html(flow_mmd, er_mmd)

    try:
        import webview
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "pywebview"], check=True)
        import webview

    window = webview.create_window(
        "AXL Diagrams",
        html=html,
        width=args.width,
        height=args.height,
        resizable=True,
        text_select=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
