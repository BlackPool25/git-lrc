[🇬🇧 English](https://github.com/HexmosTech/git-lrc/blob/main/README.md)

[![git-lrc logo](https://hexmos.com/freedevtools/public/lr_logo.svg)](https://hexmos.com/freedevtools/public/lr_logo.svg)

# git-lrc

## कमिट पर चलने वाली मुफ़्त, असीमित AI कोड समीक्षा

[![Go Report Card](https://goreportcard.com/badge/github.com/HexmosTech/git-lrc)](https://goreportcard.com/report/github.com/HexmosTech/git-lrc)

---

AI एजेंट कोड तेज़ी से लिखते हैं — और _चुपके से लॉजिक हटा देते हैं_, व्यवहार बदल देते हैं, बग डाल देते हैं — बिना बताए। अक्सर आपको प्रोडक्शन में जाने के बाद पता चलता है।

**`git-lrc` इसे ठीक करता है।** यह `git commit` पर hook होता है और हर diff को _लैंड होने से पहले_ review करता है। 60 सेकंड में सेटअप। पूरी तरह मुफ़्त।

## इसे काम करते देखें

> git-lrc को गंभीर सुरक्षा समस्याएं पकड़ते देखें — जैसे leaked credentials, महंगे cloud operations, और log statements में sensitive data

## क्यों ज़रूरी है

- 🤖 **AI एजेंट चुपके से चीज़ें तोड़ते हैं।** कोड हटाया जाता है। लॉजिक बदल जाता है। Edge cases गायब हो जाते हैं। जब तक प्रोडक्शन में न जाए, आपको पता नहीं चलता।
- 🔍 **शिपिंग से पहले पकड़ें।** AI-powered inline comments आपको _बिल्कुल_ बताते हैं कि क्या बदला और क्या गलत लग रहा है।
- 🔁 **आदत बनाएं, बेहतर कोड भेजें।** नियमित review → कम bugs → ज़्यादा robust कोड → टीम में बेहतर नतीजे।
- 🔗 **Git क्यों?** Git universal है। हर editor, हर IDE, हर AI toolkit इसे use करती है। Commit करना अनिवार्य है। इसलिए review मिस होने की _लगभग कोई संभावना नहीं_ — आपका stack चाहे जो भी हो।

## शुरू करें

### इंस्टॉल करें

#### IPM के ज़रिए (अनुशंसित):

```
# Linux/macOS
curl -L https://hexmos.com/ipm-install | bash && ipm i HexmosTech/git-lrc

# Windows
iwr https://hexmos.com/ipm-install-ps | iex; ipm i HexmosTech/git-lrc
```

#### वैकल्पिक (direct install):

**Linux / macOS:**

```
curl -fsSL https://hexmos.com/lrc-install.sh | bash
```

**Windows (PowerShell):**

```
iwr -useb https://hexmos.com/lrc-install.ps1 | iex
```

Binary install हो गई। Hooks globally set हो गए। बस।

### सेटअप

```
git lrc setup
```

दो steps, दोनों browser में खुलेंगे:

1. **LiveReview API key** — Hexmos से sign in करें
2. **मुफ़्त Gemini API key** — Google AI Studio से लें

**~1 मिनट। एक बार सेटअप, पूरी machine पर काम करेगा।** इसके बाद, आपकी machine के _हर git repo_ में commit करते ही review trigger होगा। प्रति-repo कोई config नहीं चाहिए।

## यह कैसे काम करता है

### Option A: Commit पर automatic review

```
git add .
git commit -m "add payment validation"
# commit होने से पहले review अपने आप शुरू हो जाता है
```

### Option B: Commit से पहले manual review

```
git add .
git lrc review          # पहले AI review चलाएं
# या: git lrc review --vouch   # personally vouch करें, AI skip करें
# या: git lrc review --skip    # review पूरी तरह skip करें
git commit -m "add payment validation"
```

दोनों ही तरीकों में browser में एक web UI खुलेगा।

### Review UI में क्या मिलता है

- 📄 **GitHub-style diff** — रंग-कोडेड additions/deletions
- 💬 **Inline AI comments** — बिल्कुल उन्हीं lines पर जो matter करती हैं, severity badges के साथ
- 📝 **Review summary** — AI को क्या मिला इसका high-level overview
- 📁 **Staged files की सूची** — सभी staged files एक नज़र में देखें, उनके बीच jump करें
- 📊 **Diff summary** — प्रति file add/remove lines, बदलाव का अंदाज़ा लगाने के लिए
- 📋 **Issues copy करें** — एक click में सभी AI-flagged issues copy करें, सीधे अपने AI agent को paste करें
- 🔄 **Issues के बीच navigate करें** — scroll किए बिना एक-एक comment देखें
- 📜 **Event log** — review events, iterations, और status changes एक जगह देखें

### निर्णय

| Action | क्या होता है |
| --- | --- |
| ✅ **Commit** | Reviewed changes accept करके commit करें |
| 🚀 **Commit & Push** | एक step में commit और remote पर push करें |
| ⏭️ **Skip** | Commit abort करें — पहले issues ठीक करें |

## Review Cycle

AI-generated कोड के साथ सामान्य workflow:

1. अपने AI agent से **कोड generate** करें
2. **`git add .` → `git lrc review`** — AI issues flag करता है
3. **Issues copy करें, agent को वापस दें** ठीक करने के लिए
4. **`git add .` → `git lrc review`** — AI फिर से review करता है
5. संतुष्ट होने तक दोहराएं
6. **`git lrc review --vouch`** → **`git commit`** — आप vouch करें और commit करें

हर `git lrc review` एक **iteration** है। Tool track करता है कि आपने कितने iterations किए और diff का कितना प्रतिशत AI-reviewed हुआ (**coverage**)।

### Vouch (ज़िम्मेदारी लेना)

पर्याप्त iterations के बाद जब आप code से संतुष्ट हों:

```
git lrc review --vouch
```

इसका मतलब है: _"मैंने यह review कर लिया है — AI iterations या personally — और मैं ज़िम्मेदारी लेता हूँ।"_ AI review नहीं चलता, लेकिन पिछले iterations की coverage stats record होती हैं।

### Skip (छोड़ना)

सिर्फ review या ज़िम्मेदारी attestation के बिना commit करना चाहते हैं?

```
git lrc review --skip
```

न AI review, न personal attestation। Git log में `skipped` record होगा।

## Git Log Tracking

हर commit के git log message में एक **review status line** जुड़ती है:

```
LiveReview Pre-Commit Check: ran (iter:3, coverage:85%)
```

```
LiveReview Pre-Commit Check: vouched (iter:2, coverage:50%)
```

```
LiveReview Pre-Commit Check: skipped
```

- **`iter`** — commit से पहले review cycles की संख्या। `iter:3` = तीन rounds: review → fix → review।
- **`coverage`** — final diff का वह प्रतिशत जो पहले के iterations में AI-reviewed हो चुका था। `coverage:85%` = सिर्फ 15% कोड unreviewed है।

आपकी टीम `git log` में _बिल्कुल_ देख सकती है कि कौन से commits review, vouch, या skip हुए थे।

## अपना AI Connector लाएं (BYOK)

Default Gemini setup के अलावा, आप अपनी खुद की API keys भी ला सकते हैं:

- OpenAI
- Claude
- DeepSeek
- OpenRouter

इसके लिए:

```
lrc ui
```

UI से आप:

- Account re-authenticate कर सकते हैं
- AI connectors add या update कर सकते हैं
- Priority set करने के लिए connectors को reorder कर सकते हैं

Default में list का **पहला connector** review के लिए use होता है।

## सुरक्षा

- Security को git-lrc में core product requirement माना जाता है।
- Reporting channels, response commitments, और operational safeguards clearly document हैं।
- Automated security checks और SBOM workflows transparent verification support करते हैं।
- पूरी जानकारी के लिए [SECURITY.md](https://github.com/HexmosTech/git-lrc/blob/main/SECURITY.md) देखें।

## अक्सर पूछे जाने वाले सवाल (FAQ)

### Review vs Vouch vs Skip में फ़र्क?

|  | **Review** | **Vouch** | **Skip** |
| --- | --- | --- | --- |
| AI diff review करता है? | ✅ हाँ | ❌ नहीं | ❌ नहीं |
| ज़िम्मेदारी लेता है? | ✅ हाँ | ✅ हाँ, explicitly | ⚠️ नहीं |
| Iterations track करता है? | ✅ हाँ | ✅ पिछली coverage record करता है | ❌ नहीं |
| Git log message | `ran (iter:N, coverage:X%)` | `vouched (iter:N, coverage:X%)` | `skipped` |
| कब use करें | हर review cycle में | Iterations पूरे हो जाएं, commit के लिए तैयार हों | इस commit को review नहीं करना |

**Review** default है। AI आपके staged diff को analyze करता है और inline feedback देता है।

**Vouch** का मतलब है आप _explicitly इस commit की ज़िम्मेदारी ले रहे हैं_। आमतौर पर कई review iterations के बाद use होता है।

**Skip** का मतलब है आप इस particular commit को review नहीं कर रहे। Git log में सिर्फ `skipped` record होता है।

### यह मुफ़्त कैसे है?

`git-lrc` AI reviews के लिए default में **Google का Gemini API** use करता है, और BYOK connectors (OpenAI, Claude, DeepSeek, OpenRouter) भी support करता है। Gemini का free tier काफी generous है। आप अपनी API key(s) लाते हैं — कोई middleman billing नहीं। Reviews coordinate करने वाली LiveReview cloud service individual developers के लिए मुफ़्त है।

### Data कहाँ जाता है?

सिर्फ **staged diff** analyze होती है। कोई full repository context upload नहीं होती, और review के बाद diffs store नहीं होते।

### किसी specific repo के लिए disable कैसे करें?

```
git lrc hooks disable   # इस repo के लिए disable करें
git lrc hooks enable    # बाद में re-enable करें
```

### पुराना commit review कैसे करें?

```
git lrc review --commit HEAD       # आखिरी commit review करें
git lrc review --commit HEAD~3..HEAD  # एक range review करें
```

## Quick Reference

| Command | विवरण |
| --- | --- |
| `lrc setup` | Guided onboarding और initial auth/config |
| `lrc ui` | Re-auth, BYOK connectors manage करने के लिए local UI खोलें |
| `lrc` या `lrc review` | Sensible defaults के साथ review चलाएं |
| `lrc review --staged` | सिर्फ staged changes review करें |
| `lrc review --commit HEAD` | एक specific commit review करें |
| `lrc review --commit HEAD~3..HEAD` | Commit range review करें |
| `lrc review --vouch` | Vouch — AI skip, personal ज़िम्मेदारी लें |
| `lrc review --skip` | इस commit के लिए review skip करें |
| `lrc hooks install` | Global hook dispatcher install करें |
| `lrc hooks uninstall` | Global hook dispatcher और managed scripts हटाएं |
| `lrc hooks enable` | इस repo के लिए hooks enable करें |
| `lrc hooks disable` | इस repo के लिए hooks disable करें |
| `lrc hooks status` | इस repo के लिए hook status देखें |
| `lrc self-update` | Latest version में update करें |
| `lrc version` | Version info देखें |

> **Tip:** `git lrc <command>` और `lrc <command>` एक दूसरे के बदले इस्तेमाल किए जा सकते हैं।

## यह मुफ़्त है। अपने दोस्तों और साथियों से share करें।

`git-lrc` **पूरी तरह मुफ़्त है।** No credit card. No trial. No catch.

अगर यह आपके काम आया — **अपने developer दोस्तों से share करें।** जितने ज़्यादा लोग AI-generated code review करेंगे, उतने कम bugs production तक पहुंचेंगे।

⭐ **[इस repo को Star करें](https://github.com/HexmosTech/git-lrc)** ताकि दूसरों को भी पता चले।

## Community

अपनी ज़रूरत के हिसाब से सही जगह चुनें:

- **Discord**: [discord.gg/R5PX8nCH](https://discord.gg/R5PX8nCH) — Community से जुड़ने, general Q&A पूछने, और team से quick back-and-forth के लिए सबसे अच्छा।
- **GitHub Discussions**: [github.com/HexmosTech/git-lrc/discussions](https://github.com/HexmosTech/git-lrc/discussions) — In-depth idea proposals, scoping, design discussions, और constructive criticism के लिए।
- **GitHub Issues**: [github.com/HexmosTech/git-lrc/issues](https://github.com/HexmosTech/git-lrc/issues) — Concrete, scoped tasks जैसे bugs, focused feature requests, और actionable implementation work के लिए।

## License

`git-lrc` **Sustainable Use License (SUL)** के modified variant के तहत distribute होता है।

**इसका मतलब:**

- ✅ **Source Available** — Self-hosting के लिए पूरा source code available है
- ✅ **Business Use Allowed** — अपने internal business operations के लिए LiveReview use करें
- ✅ **Modifications Allowed** — अपने use के लिए customize करें
- ❌ **No Resale** — Resell या competing service के रूप में offer नहीं किया जा सकता
- ❌ **No Redistribution** — Modified versions commercially redistribute नहीं की जा सकतीं

पूरी जानकारी के लिए [LICENSE.md](https://github.com/HexmosTech/git-lrc/blob/main/LICENSE.md) देखें।

---

## Teams के लिए: LiveReview

> `git-lrc` अकेले use कर रहे हैं? बढ़िया। Team के साथ build कर रहे हैं? **[LiveReview](https://hexmos.com/livereview)** देखें — team-wide AI code review का full suite, dashboards, org-level policies, और review analytics के साथ। `git-lrc` जो करता है वह सब, plus team coordination।
