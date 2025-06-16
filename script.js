const input = document.getElementById("searchInput");
const results = document.getElementById("results");
const suggestionsList = document.getElementById("suggestions");
const clearButton = document.getElementById("clearButton");
let selectedSuggestionIndex = -1;

// Cache for storing API results
const searchCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return dp[a.length][b.length];
}

async function searchWikipedia(query) {
    // Check cache first
    const cached = searchCache.get(query);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=15&namespace=0&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();

    // Store in cache
    searchCache.set(query, { data, timestamp: now });

    // Limit cache size to 100 entries
    if (searchCache.size > 100) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }

    return data;
}

async function suggestAlternative(query) {
    const altSearch = await searchWikipedia(query.slice(0, 3));
    const [_, titles] = altSearch;
    return titles.filter(title => levenshtein(title.toLowerCase(), query.toLowerCase()) <= 3);
}

function prioritizeResults(titles, descs, links, query) {
    const lowerQuery = query.toLowerCase();
    const results = titles.map((title, i) => ({
        title,
        desc: descs[i],
        link: links[i],
        score: calculateScore(title, lowerQuery)
    }));

    return results.sort((a, b) => b.score - a.score);
}

function calculateScore(title, query) {
    const lowerTitle = title.toLowerCase();
    let score = 0;

    if (lowerTitle === query) return 1000;
    if (lowerTitle.startsWith(query)) score += 500;

    const levDistance = levenshtein(lowerTitle, query);
    score += Math.max(0, 100 - levDistance * 10);

    const queryWords = query.split(/\s+/);
    const titleWords = lowerTitle.split(/\s+/);
    const matchedWords = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw))).length;
    score += matchedWords * 50;

    return score;
}

function updateSuggestions(suggestions) {
    suggestionsList.innerHTML = '';
    selectedSuggestionIndex = -1;
    if (suggestions.length) {
        suggestionsList.classList.remove('hidden');
        suggestions.forEach((s, index) => {
            const li = document.createElement("li");
            li.className = "p-3 hover:bg-gray-100 cursor-pointer text-gray-700 transition-colors duration-150 fade-in";
            li.textContent = s;
            li.onclick = () => {
                input.value = s;
                input.dispatchEvent(new Event("input"));
            };
            li.onmouseover = () => {
                suggestionsList.querySelectorAll('li').forEach(el => el.classList.remove('suggestion-highlight'));
                li.classList.add('suggestion-highlight');
                selectedSuggestionIndex = index;
            };
            suggestionsList.appendChild(li);
        });
    } else {
        suggestionsList.classList.add('hidden');
    }
}

function handleKeyNavigation(e) {
    const suggestions = suggestionsList.querySelectorAll('li');
    if (!suggestions.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
        updateHighlight(suggestions);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateHighlight(suggestions);
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        input.value = suggestions[selectedSuggestionIndex].textContent;
        input.dispatchEvent(new Event("input"));
    }
}

function updateHighlight(suggestions) {
    suggestions.forEach((el, index) => {
        el.classList.toggle('suggestion-highlight', index === selectedSuggestionIndex);
    });
    if (selectedSuggestionIndex >= 0) {
        suggestions[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSearch = debounce(async () => {
    const q = input.value.trim();
    results.innerHTML = '';
    suggestionsList.innerHTML = '';
    suggestionsList.classList.add('hidden');
    clearButton.classList.toggle('hidden', !q);

    if (!q) return;

    const [search, titles, descs, links] = await searchWikipedia(q);

    if (titles.length > 0) {
        const prioritizedResults = prioritizeResults(titles, descs, links, q);
        prioritizedResults.forEach(({ title, desc, link }) => {
            const el = document.createElement("div");
            el.className = "bg-white p-5 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 fade-in";
            el.innerHTML = `
                <a href="${link}" target="_blank" class="text-blue-600 text-xl font-semibold hover:underline">${title}</a>
                <p class="text-sm text-gray-600 mt-2">${desc || "No description available."}</p>
            `;
            results.appendChild(el);
        });
    } else {
        const altQuery = await suggestAlternative(q);
        updateSuggestions(altQuery);
        if (!altQuery.length) {
            results.innerHTML = `<p class="text-gray-500 text-center fade-in">No results found. Try another search term.</p>`;
        }
    }
}, 300);

input.addEventListener("input", debouncedSearch);
input.addEventListener("keydown", handleKeyNavigation);

clearButton.addEventListener("click", () => {
    input.value = '';
    debouncedSearch();
    input.focus();
});