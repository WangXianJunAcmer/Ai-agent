/* ai-agent frontend/js/markdown.js */
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeMarkdownHref(url) {
    var u = String(url || "").trim();
    // Only http(s) — blocks javascript:/data: and attribute breakout via escapeHtml.
    if (!/^https?:\/\//i.test(u)) return "";
    return escapeHtml(u);
  }

  function formatInlineMarkdown(text) {
    var escaped = escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br />");
    var inlineCodes = [];
    var out = escaped.replace(/`([^`\n]+)`/g, function (_, code) {
      inlineCodes.push("<code>" + code + "</code>");
      return "%%INLINECODE_" + (inlineCodes.length - 1) + "%%";
    });
    out = out
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
        var href = safeMarkdownHref(url);
        return href
          ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>"
          : label;
      })
      .replace(/(^|[^"'>=])(https?:\/\/[^\s<]+)/g, function (_, lead, url) {
        // Trim trailing punctuation that is usually not part of the URL.
        var clean = url.replace(/[),.，。；;:：!?！？]+$/g, "");
        var trail = url.slice(clean.length);
        var href = safeMarkdownHref(clean);
        if (!href) return lead + url;
        return lead + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + href + "</a>" + trail;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>");
    return out.replace(/%%INLINECODE_(\d+)%%/g, function (_, index) {
      return inlineCodes[Number(index)] || "";
    });
  }

  function isTableRowLine(line) {
    var trimmed = String(line || "").trim();
    return trimmed.indexOf("|") >= 0 && /^\|?.+\|.+/.test(trimmed);
  }

  function parseTableCells(line) {
    var trimmed = String(line || "").trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map(function (cell) { return cell.trim(); });
  }

  function isTableSeparatorCells(cells) {
    return cells.length > 0 && cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function readTableBlock(lines, start) {
    var rows = [];
    var i = start;
    while (i < lines.length) {
      var trimmed = lines[i].trim();
      if (!trimmed) {
        i += 1;
        continue;
      }
      if (!isTableRowLine(lines[i])) break;
      rows.push(parseTableCells(lines[i]));
      i += 1;
    }
    if (rows.length < 2 || !isTableSeparatorCells(rows[1])) return null;
    var header = rows[0];
    var bodyRows = rows.slice(2);
    var parts = ['<div class="md-table-wrap"><table><thead><tr>'];
    header.forEach(function (cell) {
      parts.push("<th>" + formatInlineMarkdown(cell) + "</th>");
    });
    parts.push("</tr></thead><tbody>");
    bodyRows.forEach(function (row) {
      parts.push("<tr>");
      for (var c = 0; c < header.length; c += 1) {
        parts.push("<td>" + formatInlineMarkdown(row[c] || "") + "</td>");
      }
      parts.push("</tr>");
    });
    parts.push("</tbody></table></div>");
    return { html: parts.join(""), next: i };
  }

  function normalizeCodeLang(lang) {
    var raw = String(lang || "").trim().toLowerCase();
    if (!raw) return "generic";
    if (/^(c\+\+|cpp|cc|cxx|hpp|h\+\+)$/.test(raw)) return "cpp";
    if (/^(c|h)$/.test(raw)) return "c";
    if (/^(js|javascript|jsx|mjs|cjs)$/.test(raw)) return "javascript";
    if (/^(ts|typescript|tsx)$/.test(raw)) return "typescript";
    if (/^(py|python|python3)$/.test(raw)) return "python";
    if (/^(sh|bash|shell|zsh)$/.test(raw)) return "bash";
    if (/^(yml|yaml)$/.test(raw)) return "yaml";
    if (/^(md|markdown)$/.test(raw)) return "markdown";
    return raw;
  }

  function highlightCode(code, lang) {
    var source = String(code || "").replace(/\n$/, "");
    var kind = normalizeCodeLang(lang);
    var keywords = {
      python: "False|True|None|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield",
      cpp: "alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq",
      c: "auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary",
      javascript: "async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield",
      typescript: "abstract|any|as|asserts|async|await|boolean|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|module|namespace|never|new|null|number|object|of|package|private|protected|public|readonly|require|return|set|static|string|super|switch|symbol|this|throw|true|try|type|typeof|undefined|unique|unknown|var|void|while|with|yield",
      bash: "if|then|else|elif|fi|for|while|do|done|case|esac|function|select|until|in|time|coproc",
      go: "break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var",
      rust: "as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while",
      java: "abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|null",
      sql: "add|all|alter|and|as|asc|between|by|case|check|column|constraint|create|database|default|delete|desc|distinct|drop|else|end|exists|foreign|from|full|group|having|in|index|inner|insert|into|is|join|key|left|like|limit|not|null|on|or|order|outer|primary|references|right|select|set|table|then|union|unique|update|values|when|where",
    };
    var types = {
      cpp: "string|wstring|u16string|u32string|vector|map|set|unordered_map|unordered_set|pair|tuple|optional|variant|array|deque|list|queue|stack|priority_queue|shared_ptr|unique_ptr|weak_ptr|size_t|ssize_t|ptrdiff_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|ifstream|ofstream|ostream|istream|stringstream",
      c: "size_t|ssize_t|ptrdiff_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|FILE",
      typescript: "string|number|boolean|object|symbol|bigint|any|unknown|never|void|Record|Partial|Required|Readonly|Array|Promise|Map|Set",
      java: "String|Integer|Boolean|Double|Float|Long|Short|Byte|Character|Object|List|Map|Set|Optional",
      go: "string|bool|byte|rune|error|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|complex64|complex128",
      rust: "String|str|bool|char|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet",
      python: "int|float|str|bool|list|dict|set|tuple|bytes|object|NoneType",
    };
    var kw = keywords[kind] || keywords.javascript;
    var ty = types[kind] || "";
    var tokens = [];
    var i = 0;
    var n = source.length;

    function pushTok(type, value) {
      if (!value) return;
      tokens.push({ type: type, value: value });
    }

    function startsWith(str) {
      return source.slice(i, i + str.length) === str;
    }

    while (i < n) {
      var ch = source[i];
      var next = source[i + 1] || "";

      // comments
      if (kind === "python" && ch === "#") {
        var cEnd = source.indexOf("\n", i);
        if (cEnd < 0) cEnd = n;
        pushTok("cmt", source.slice(i, cEnd));
        i = cEnd;
        continue;
      }
      if ((kind === "bash") && ch === "#") {
        var bEnd = source.indexOf("\n", i);
        if (bEnd < 0) bEnd = n;
        pushTok("cmt", source.slice(i, bEnd));
        i = bEnd;
        continue;
      }
      if (ch === "/" && next === "/" && kind !== "python") {
        var lineEnd = source.indexOf("\n", i);
        if (lineEnd < 0) lineEnd = n;
        pushTok("cmt", source.slice(i, lineEnd));
        i = lineEnd;
        continue;
      }
      if (ch === "/" && next === "*" && kind !== "python" && kind !== "bash") {
        var blockEnd = source.indexOf("*/", i + 2);
        if (blockEnd < 0) blockEnd = n - 2;
        pushTok("cmt", source.slice(i, blockEnd + 2));
        i = blockEnd + 2;
        continue;
      }

      // preprocessor
      if ((kind === "cpp" || kind === "c") && ch === "#") {
        var pEnd = i + 1;
        while (pEnd < n && source[pEnd] !== "\n") {
          if (source[pEnd] === "\\" && source[pEnd + 1] === "\n") pEnd += 2;
          else pEnd += 1;
        }
        pushTok("pp", source.slice(i, pEnd));
        i = pEnd;
        continue;
      }

      // strings
      if (ch === "'" || ch === '"' || (ch === "`" && (kind === "javascript" || kind === "typescript" || kind === "bash"))) {
        var quote = ch;
        var j = i + 1;
        var triple = (kind === "python" && startsWith(quote + quote + quote));
        if (triple) {
          j = i + 3;
          var close = source.indexOf(quote + quote + quote, j);
          if (close < 0) close = n - 3;
          pushTok("str", source.slice(i, close + 3));
          i = close + 3;
          continue;
        }
        while (j < n) {
          if (source[j] === "\\" && j + 1 < n) { j += 2; continue; }
          if (source[j] === quote) { j += 1; break; }
          if (quote !== "`" && source[j] === "\n") break;
          j += 1;
        }
        pushTok("str", source.slice(i, j));
        i = j;
        continue;
      }
      if (kind === "python" && (startsWith('r"') || startsWith("r'") || startsWith('f"') || startsWith("f'") || startsWith('b"') || startsWith("b'"))) {
        var q = source[i + 1];
        var k = i + 2;
        while (k < n) {
          if (source[k] === "\\" && k + 1 < n) { k += 2; continue; }
          if (source[k] === q) { k += 1; break; }
          if (source[k] === "\n") break;
          k += 1;
        }
        pushTok("str", source.slice(i, k));
        i = k;
        continue;
      }

      // numbers
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next))) {
        var m = source.slice(i).match(/^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?[fFlLuU]*)/);
        if (m) {
          pushTok("num", m[0]);
          i += m[0].length;
          continue;
        }
      }

      // identifiers / keywords / types / functions
      if (/[A-Za-z_$@]/.test(ch)) {
        var idMatch = source.slice(i).match(/^[A-Za-z_$@][A-Za-z0-9_$@]*/);
        var id = idMatch ? idMatch[0] : ch;
        var after = source.slice(i + id.length).match(/^\s*\(/);
        if (new RegExp("^(?:" + kw + ")$").test(id)) pushTok("kw", id);
        else if (ty && new RegExp("^(?:" + ty + ")$").test(id)) pushTok("type", id);
        else if (after) pushTok("fn", id);
        else if (/^[A-Z][A-Za-z0-9_]*$/.test(id) && kind !== "bash") pushTok("type", id);
        else pushTok("", id);
        i += id.length;
        continue;
      }

      // operators / punctuation
      if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
        var opMatch = source.slice(i).match(/^(<<=|>>=|<=>|::|->|\+\+|--|&&|\|\||<<|>>|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|={1,3}|[+\-*/%=<>!&|^~?:])/);
        if (opMatch) {
          pushTok("op", opMatch[0]);
          i += opMatch[0].length;
          continue;
        }
      }
      if (/[()[\]{},.;]/.test(ch)) {
        pushTok("punct", ch);
        i += 1;
        continue;
      }

      pushTok("", ch);
      i += 1;
    }

    return tokens.map(function (tok) {
      var safe = escapeHtml(tok.value);
      if (!tok.type) return safe;
      return '<span class="tok-' + tok.type + '">' + safe + "</span>";
    }).join("");
  }

  function parseCodeFenceInfo(info) {
    // Cursor citation fences look like: ```143:161:examples/foo.cpp
    var raw = String(info || "").trim();
    if (!raw) return { lang: "", label: "code" };
    var cite = raw.match(/^(\d+):(\d+):(.+)$/);
    if (cite) {
      var path = cite[3].trim();
      var base = path.split(/[\\/]/).pop() || path;
      var ext = (base.indexOf(".") >= 0 ? base.split(".").pop() : "").toLowerCase();
      return { lang: ext || "", label: path };
    }
    // Bare path / file.ext used as fence info
    if (/[\\/]/.test(raw) || /\.[A-Za-z0-9]{1,10}$/.test(raw)) {
      var base2 = raw.split(/[\\/]/).pop() || raw;
      var ext2 = (base2.indexOf(".") >= 0 ? base2.split(".").pop() : "").toLowerCase();
      if (ext2 && !/\s/.test(ext2)) return { lang: ext2, label: raw };
    }
    return { lang: raw, label: "" };
  }

  function codeLangLabel(lang) {
    var kind = normalizeCodeLang(lang);
    var labels = {
      python: "python",
      cpp: "cpp",
      c: "c",
      javascript: "javascript",
      typescript: "typescript",
      bash: "bash",
      go: "go",
      rust: "rust",
      java: "java",
      sql: "sql",
      yaml: "yaml",
      json: "json",
      html: "html",
      css: "css",
      markdown: "markdown",
      generic: "code",
    };
    if (labels[kind]) return labels[kind];
    return String(lang || "code").trim().toLowerCase() || "code";
  }

  function renderCodeBlock(lang, code) {
    var raw = String(code || "").replace(/\n$/, "");
    var info = parseCodeFenceInfo(lang);
    var language = info.lang;
    var label = info.label || codeLangLabel(language);
    var cls = language ? ' class="language-' + escapeHtml(normalizeCodeLang(language)) + '"' : "";
    var highlighted = highlightCode(raw, language);
    return (
      '<div class="ai-agent-codeblock">' +
        '<div class="ai-agent-codeblock-header">' +
          '<span class="ai-agent-codeblock-lang">' + escapeHtml(label) + "</span>" +
          '<button type="button" class="ai-agent-codeblock-copy" data-copy-label="复制">复制</button>' +
        "</div>" +
        "<pre><code" + cls + ">" + highlighted + "</code></pre>" +
      "</div>"
    );
  }

  function bindCodeBlockCopy(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll(".ai-agent-codeblock"), function (block) {
      if (block.__copyBound) return;
      block.__copyBound = true;
      var btn = block.querySelector(".ai-agent-codeblock-copy");
      var codeEl = block.querySelector("pre code");
      if (!btn || !codeEl) return;
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var text = codeEl.textContent || "";
        function markCopied() {
          btn.textContent = "已复制";
          btn.classList.add("is-copied");
          setTimeout(function () {
            btn.textContent = btn.getAttribute("data-copy-label") || "复制";
            btn.classList.remove("is-copied");
          }, 1400);
        }
        function fallbackCopy() {
          var range = document.createRange();
          range.selectNodeContents(codeEl);
          var sel = window.getSelection();
          if (!sel) return false;
          sel.removeAllRanges();
          sel.addRange(range);
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
          sel.removeAllRanges();
          return ok;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(markCopied).catch(function () {
            if (fallbackCopy()) markCopied();
          });
        } else if (fallbackCopy()) {
          markCopied();
        }
      });
    });
  }

  function renderMarkdown(text) {
    var normalized = text.replace(/\r\n/g, "\n");
    var codeBlocks = [];
    normalized = normalized.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      codeBlocks.push(renderCodeBlock(lang, code));
      return "%%CODEBLOCK_" + (codeBlocks.length - 1) + "%%";
    });

    var lines = normalized.split("\n");
    var html = [];
    var inList = false;
    var listType = "";

    function closeList() {
      if (inList) {
        html.push("</" + listType + ">");
        inList = false;
        listType = "";
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        closeList();
        continue;
      }
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) {
        closeList();
        html.push(trimmed);
        continue;
      }
      if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
        closeList();
        html.push("<hr />");
        continue;
      }
      if (isTableRowLine(line)) {
        var table = readTableBlock(lines, i);
        if (table) {
          closeList();
          html.push(table.html);
          i = table.next - 1;
          continue;
        }
      }
      if (/^####\s+/.test(trimmed)) {
        closeList();
        html.push("<h4>" + formatInlineMarkdown(trimmed.replace(/^####\s+/, "")) + "</h4>");
        continue;
      }
      if (/^###\s+/.test(trimmed)) {
        closeList();
        html.push("<h3>" + formatInlineMarkdown(trimmed.replace(/^###\s+/, "")) + "</h3>");
        continue;
      }
      if (/^##\s+/.test(trimmed)) {
        closeList();
        html.push("<h2>" + formatInlineMarkdown(trimmed.replace(/^##\s+/, "")) + "</h2>");
        continue;
      }
      if (/^#\s+/.test(trimmed)) {
        closeList();
        html.push("<h1>" + formatInlineMarkdown(trimmed.replace(/^#\s+/, "")) + "</h1>");
        continue;
      }
      if (/^>\s+/.test(trimmed)) {
        closeList();
        html.push("<blockquote>" + formatInlineMarkdown(trimmed.replace(/^>\s+/, "")) + "</blockquote>");
        continue;
      }
      if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        var taskBody = trimmed.replace(/^[-*]\s+/, "");
        var checked = /^\[[xX]\]/.test(taskBody);
        var taskText = taskBody.replace(/^\[[ xX]\]\s+/, "");
        html.push(
          '<li><input type="checkbox" disabled' + (checked ? " checked" : "") + ' />' +
          formatInlineMarkdown(taskText) + "</li>"
        );
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== "ol") {
          closeList();
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, "")) + "</li>");
        continue;
      }

      closeList();
      html.push("<p>" + formatInlineMarkdown(trimmed) + "</p>");
    }
    closeList();

    return html.join("\n").replace(/%%CODEBLOCK_(\d+)%%/g, function (_, index) {
      return codeBlocks[Number(index)] || "";
    });
  }

