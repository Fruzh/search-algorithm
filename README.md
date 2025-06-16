
# 🔍 Search Algorithm

A powerful and flexible search interface built with pure HTML, JavaScript, and Tailwind CSS.  
It uses an external public API (Wikipedia) to retrieve live search results, while allowing typo-tolerant querying and intelligent suggestions.

## 🚀 Features

- Typo-tolerant search (up to 2 character mismatches)
- Auto-suggestions for common mistakes
- Realtime result fetching from Wikipedia API
- Clean and responsive UI using Tailwind CSS CDN
- No external framework or build tools – works out of the box

## 📦 Tech Stack

- HTML + Vanilla JavaScript
- Tailwind CSS via CDN
- Wikipedia OpenSearch API

## 🧠 How it Works

1. User types a query into the search bar.
2. If the exact match is not found, the algorithm compares input with other related terms using Levenshtein Distance.
3. Suggestions are shown for misspelled input.
4. Results are fetched and displayed in real-time from Wikipedia.

## 🌐 Live API Used

- Wikipedia OpenSearch API:  
  `https://en.wikipedia.org/w/api.php?action=opensearch&search=QUERY&limit=10&namespace=0&format=json&origin=*`

## 📁 How to Use

Just open `index.html` in your browser — no build step or server required.

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
