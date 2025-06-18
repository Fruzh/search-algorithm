const input = document.getElementById("searchInput");
const results = document.getElementById("results");
const suggestionsList = document.getElementById("suggestions");
const clearButton = document.getElementById("clearButton");
const languageSelect = document.getElementById("languageSelect");
const loading = document.getElementById("loading");
const searchInfo = document.getElementById("searchInfo");
const timeoutWarning = document.getElementById("timeoutWarning");
const retryButton = document.getElementById("retryButton");
let selectedSuggestionIndex = -1;

const searchCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const TYPO_TOLERANCE = 2;
const SEARCH_TIMEOUT = 30000;

const savedLang = localStorage.getItem('language') || 'en';
i18next.init({
    lng: savedLang,
    resources: {
        en: {
            translation: {
                "search_title": "Search Algorithm",
                "search_placeholder": "Search Wikipedia articles...",
                "no_results": "No results found. Try another search term.",
                "search_results_for": "Result for \"{{query}}\" in {{time}} seconds",
                "search_results_similar": "Result for \"{{query}}\" or similar in {{time}} seconds",
                "failed_search": "Failed to search. Please try again.",
                "recommend_search": "Did you mean to search for \"<a href='#' id='recommendLink' class='text-blue-600 hover:underline'>{{term}}</a>\"?"
            }
        },
        id: {
            translation: {
                "search_title": "Algoritma Pencarian",
                "search_placeholder": "Cari artikel Wikipedia...",
                "no_results": "Tidak ada hasil ditemukan. Coba istilah pencarian lain.",
                "search_results_for": "Hasil untuk \"{{query}}\" dalam {{time}} detik",
                "search_results_similar": "Hasil untuk \"{{query}}\" atau yang mirip dalam {{time}} detik",
                "failed_search": "Gagal mencari. Silakan coba lagi.",
                "recommend_search": "Apakah Anda ingin mencari \"<a href='#' id='recommendLink' class='text-blue-600 hover:underline'>{{term}}</a>\"?"
            }
        }
    }
}, function (err, t) {
    languageSelect.value = savedLang;
    updateLanguage();
});

function updateLanguage() {
    document.getElementById("search-title").textContent = i18next.t("search_title");
    document.getElementById("searchInput").placeholder = i18next.t("search_placeholder");
}

languageSelect.addEventListener("change", () => {
    const newLang = languageSelect.value;
    localStorage.setItem('language', newLang);
    i18next.changeLanguage(newLang, () => {
        updateLanguage();
        debouncedSearch();
    });
});

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

async function searchWikipedia(query, lang = 'en') {
    const cached = searchCache.get(`${lang}:${query}`);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    const openSearchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=15&namespace=0&format=json&origin=*`;
    const openSearchRes = await fetch(openSearchUrl);
    const openSearchData = await openSearchRes.json();
    const titles = openSearchData[1];

    if (!titles.length) {
        return { search: [], pages: {}, titles: [] };
    }

    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(query)}&srlimit=15`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const allTitles = [...new Set([...titles, ...searchData.query.search.map(item => item.title)])].join('|');
    const extractUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(allTitles)}`;
    const extractRes = await fetch(extractUrl);
    const extractData = await extractRes.json();

    const data = { search: searchData.query.search, pages: extractData.query.pages, titles: openSearchData[1] };

    searchCache.set(`${lang}:${query}`, { data, timestamp: now });

    if (searchCache.size > 100) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }

    return data;
}

async function suggestAlternative(query, lang = 'en') {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=15&namespace=0&format=json&origin=*`;
    const res = await fetch(url);
    const [_, titles] = await res.json();
    return titles.filter(title => levenshtein(title.toLowerCase(), query.toLowerCase()) <= TYPO_TOLERANCE);
}

function prioritizeResults(searchItems, pages, titles, query) {
    const lowerQuery = query.toLowerCase();
    const results = [];

    titles.forEach(title => {
        const page = Object.values(pages).find(p => p.title === title);
        if (page && !page.missing) {
            results.push({
                title,
                desc: page.extract || i18next.t("no_results"),
                link: `https://${languageSelect.value}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
                score: calculateScore(title, page.extract || "", lowerQuery)
            });
        }
    });

    searchItems.forEach(item => {
        if (!results.some(r => r.title.toLowerCase() === item.title.toLowerCase())) {
            const page = Object.values(pages).find(p => p.title === item.title);
            if (page && !page.missing) {
                results.push({
                    title: item.title,
                    desc: page.extract || i18next.t("no_results"),
                    link: `https://${languageSelect.value}.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                    score: calculateScore(item.title, page.extract || "", lowerQuery)
                });
            }
        }
    });

    return results.sort((a, b) => b.score - a.score).slice(0, 15);
}

function calculateScore(title, desc, query) {
    const lowerTitle = title.toLowerCase();
    const lowerDesc = desc.toLowerCase();
    let score = 0;

    if (lowerTitle === query) return 2000;
    const levDistance = levenshtein(lowerTitle, query);
    if (levDistance <= TYPO_TOLERANCE) score += 1500 - levDistance * 200;
    if (lowerTitle.startsWith(query)) score += 1000;
    if (lowerTitle.includes(query)) score += 500;
    if (lowerDesc.includes(query)) score += 200;

    const queryWords = query.split(/\s+/);
    const titleWords = lowerTitle.split(/\s+/);
    const matchedWords = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw))).length;
    score += matchedWords * 100;

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

function createOptimizedDebounce(func, wait) {
    let currentRequestId = 0;
    let timeout;

    return async function (...args) {
        const requestId = ++currentRequestId;

        if (timeout) {
            clearTimeout(timeout);
        }

        return new Promise((resolve, reject) => {
            timeout = setTimeout(async () => {
                if (requestId === currentRequestId) {
                    try {
                        const result = await func.apply(this, args);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }
            }, wait);
        });
    };
}

const debouncedSearch = createOptimizedDebounce(async () => {
    const q = input.value.trim();
    results.innerHTML = '';
    suggestionsList.innerHTML = '';
    suggestionsList.classList.add('hidden');
    searchInfo.classList.add('hidden');
    timeoutWarning.classList.add('hidden');
    clearButton.classList.toggle('hidden', !q);

    if (!q) return;

    loading.classList.remove('hidden');
    const startTime = performance.now();

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Search timeout'));
        }, SEARCH_TIMEOUT);
    });

    try {
        const lang = languageSelect.value;
        const data = await Promise.race([searchWikipedia(q, lang), timeoutPromise]);
        const searchItems = data.search;
        const pages = data.pages;
        const titles = data.titles;
        const suggestions = await suggestAlternative(q, lang);

        const endTime = performance.now();
        const searchTime = ((endTime - startTime) / 1000).toFixed(3);

        const isExactMatch = titles.some(title => title.toLowerCase() === q.toLowerCase()) || 
                            searchItems.some(item => item.title.toLowerCase() === q.toLowerCase());
        const searchMessage = isExactMatch
            ? i18next.t("search_results_for", { query: q, time: searchTime })
            : i18next.t("search_results_similar", { query: q, time: searchTime });
        searchInfo.innerHTML = searchMessage;
        searchInfo.classList.remove('hidden');

        if (titles.length > 0 || searchItems.length > 0) {
            const prioritizedResults = prioritizeResults(searchItems, pages, titles, q);
            prioritizedResults.forEach(({ title, desc, link }) => {
                const el = document.createElement("div");
                el.className = "bg-white p-5 rounded-lg shadow-md hover:bg-gray-50 transition-colors duration-200 fade-in";
                el.innerHTML = `
                    <a href="${link}" target="_blank" class="text-blue-600 text-xl font-semibold hover:underline">${title}</a>
                    <p class="text-sm text-gray-600 mt-2">${desc}</p>
                `;
                results.appendChild(el);
            });

            if (!isExactMatch && suggestions.length > 0) {
                const closestSuggestion = suggestions.reduce((closest, title) => {
                    const distance = levenshtein(title.toLowerCase(), q.toLowerCase());
                    return distance < closest.distance ? { term: title, distance } : closest;
                }, { term: '', distance: Infinity });

                if (closestSuggestion.distance <= TYPO_TOLERANCE) {
                    const recommendation = document.createElement("div");
                    recommendation.className = "mt-4 text-gray-600 fade-in";
                    recommendation.innerHTML = i18next.t("recommend_search", { term: closestSuggestion.term });
                    results.insertBefore(recommendation, results.firstChild);
                    recommendation.querySelector('#recommendLink').addEventListener('click', (e) => {
                        e.preventDefault();
                        input.value = closestSuggestion.term;
                        input.dispatchEvent(new Event("input"));
                    });
                }
            }
        } else {
            updateSuggestions(suggestions);
            if (!suggestions.length) {
                results.innerHTML = `<p class="text-gray-500 text-center fade-in">${i18next.t("no_results")}</p>`;
            }
        }
    } catch (error) {
        if (error.message === 'Search timeout') {
            timeoutWarning.classList.remove('hidden');
            results.innerHTML = `<p class="text-gray-500 text-center fade-in">${i18next.t("failed_search")}</p>`;
        }
    } finally {
        loading.classList.add('hidden');
    }
}, 300);

input.addEventListener("input", debouncedSearch);
input.addEventListener("keydown", handleKeyNavigation);

clearButton.addEventListener("click", () => {
    input.value = '';
    debouncedSearch();
    input.focus();
});

retryButton.addEventListener("click", () => {
    debouncedSearch();
});