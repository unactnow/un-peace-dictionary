(function () {
    'use strict';

    var root = document.getElementById('peace-dictionary');
    if (!root) return;

    var entries = root.querySelectorAll('.pd-entry');
    var groups = root.querySelectorAll('.pd-letter-group');
    var searchInput = document.getElementById('pd-search-field');
    var clearBtn = document.getElementById('pd-search-clear');
    var infoEl = document.getElementById('pd-search-info');
    var noResults = document.getElementById('pd-no-results');
    var noResultsTerm = document.getElementById('pd-no-results-term');
    var alphaNav = document.getElementById('pd-alpha-nav');
    var debounceTimer;

    // Build alpha nav
    var activeLetters = {};
    groups.forEach(function (g) {
        var letter = g.id.replace('pd-letter-', '');
        activeLetters[letter] = true;
    });
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (letter) {
        var a = document.createElement('a');
        a.textContent = letter;
        if (activeLetters[letter]) {
            a.href = '#pd-letter-' + letter;
        } else {
            a.classList.add('disabled');
            a.setAttribute('aria-disabled', 'true');
        }
        alphaNav.appendChild(a);
    });

    // Bigram similarity for fuzzy matching
    function getBigrams(str) {
        var s = str.toLowerCase().trim();
        var bigrams = [];
        for (var i = 0; i < s.length - 1; i++) {
            bigrams.push(s.substring(i, i + 2));
        }
        return bigrams;
    }

    function bigramSimilarity(a, b) {
        if (!a || !b) return 0;
        var aBigrams = getBigrams(a);
        var bBigrams = getBigrams(b);
        if (aBigrams.length === 0 || bBigrams.length === 0) return 0;
        var bSet = {};
        bBigrams.forEach(function (bg) {
            bSet[bg] = (bSet[bg] || 0) + 1;
        });
        var matches = 0;
        aBigrams.forEach(function (bg) {
            if (bSet[bg] && bSet[bg] > 0) {
                matches++;
                bSet[bg]--;
            }
        });
        return (2.0 * matches) / (aBigrams.length + bBigrams.length);
    }

    var stopWords = {a:1,an:1,and:1,are:1,as:1,at:1,be:1,by:1,do:1,for:1,from:1,has:1,have:1,he:1,her:1,his:1,i:1,if:1,in:1,is:1,it:1,its:1,my:1,no:1,not:1,of:1,on:1,or:1,our:1,she:1,so:1,that:1,the:1,their:1,them:1,then:1,there:1,these:1,they:1,this:1,to:1,up:1,us:1,was:1,we:1,will:1,with:1,you:1,your:1};

    function scoreEntry(entry, query) {
        var term = (entry.getAttribute('data-term') || '').toLowerCase();
        var search = (entry.getAttribute('data-search') || '').toLowerCase();
        var body = entry.querySelector('.pd-entry-body').textContent.toLowerCase();
        var q = query.toLowerCase().trim();
        var tokens = q.split(/\s+/).filter(function (t) { return t && !stopWords[t]; });
        if (tokens.length === 0) return 0;
        var score = 0;

        // Title matches weighted heavily
        if (term === q) score += 200;
        else if (term.indexOf(q) === 0) score += 180;
        else if (term.indexOf(q) !== -1) score += 150;

        // Per-token title hits
        var termHits = 0;
        tokens.forEach(function (t) {
            if (term.indexOf(t) !== -1) termHits++;
        });
        score += termHits * 30;

        // Search keyword matches
        var searchHits = 0;
        tokens.forEach(function (t) {
            if (search.indexOf(t) !== -1) searchHits++;
        });
        score += searchHits * 10;

        // Body text matches
        var bodyHits = 0;
        tokens.forEach(function (t) {
            if (body.indexOf(t) !== -1) bodyHits++;
        });
        score += bodyHits * 5;

        // Fuzzy matching against title words (weighted higher than keywords)
        if (score === 0) {
            var termWords = term.split(/\s+/);
            var maxTermSim = 0;
            var maxSearchSim = 0;
            tokens.forEach(function (t) {
                termWords.forEach(function (tw) {
                    var sim = bigramSimilarity(t, tw);
                    if (sim > maxTermSim) maxTermSim = sim;
                });
                search.split(/\s+/).forEach(function (sw) {
                    var sim = bigramSimilarity(t, sw);
                    if (sim > maxSearchSim) maxSearchSim = sim;
                });
            });
            if (maxTermSim >= 0.65) score += Math.round(maxTermSim * 60);
            if (maxSearchSim >= 0.65) score += Math.round(maxSearchSim * 20);
        }

        return score;
    }

    // Store each entry's original section for restoring later
    var entryHome = [];
    entries.forEach(function (entry) {
        entryHome.push({ entry: entry, section: entry.parentNode });
    });
    var termsContainer = document.getElementById('pd-terms');

    function restoreGroups() {
        entryHome.forEach(function (item) {
            item.section.appendChild(item.entry);
        });
        Array.prototype.slice.call(groups).sort(function (a, b) {
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        }).forEach(function (g) { termsContainer.appendChild(g); });
        groups.forEach(function (g) { g.classList.remove('pd-hidden'); });
        entries.forEach(function (e) { e.classList.remove('pd-hidden'); });
    }

    function performSearch() {
        var query = searchInput.value.trim();
        clearBtn.style.display = query ? 'block' : 'none';

        if (!query) {
            restoreGroups();
            noResults.style.display = 'none';
            infoEl.textContent = '';
            // removeHighlights();
            return;
        }

        // removeHighlights();

        var threshold = 10;
        var visible = 0;
        var scored = [];

        entries.forEach(function (entry) {
            var s = scoreEntry(entry, query);
            scored.push({ entry: entry, score: s });
            if (s >= threshold) visible++;
        });

        // Hide letter groups entirely during search
        groups.forEach(function (g) { g.classList.add('pd-hidden'); });

        // Sort by relevance and append matching entries flat into the container
        scored.sort(function (a, b) { return b.score - a.score; });
        /* Show only the top result — uncomment the block below to restore multi-result display
        scored.forEach(function (item) {
            if (item.score >= threshold) {
                item.entry.classList.remove('pd-hidden');
                termsContainer.appendChild(item.entry);
            } else {
                item.entry.classList.add('pd-hidden');
            }
        });
        */
        var shown = 0;
        scored.forEach(function (item) {
            if (item.score >= threshold && shown < 3) {
                item.entry.classList.remove('pd-hidden');
                termsContainer.appendChild(item.entry);
                shown++;
            } else {
                item.entry.classList.add('pd-hidden');
            }
        });
        visible = shown;

        if (visible === 0) {
            noResults.style.display = 'block';
            noResultsTerm.textContent = query;
            infoEl.textContent = 'No results';
        } else {
            noResults.style.display = 'none';
            infoEl.textContent = visible + ' match' + (visible !== 1 ? 'es' : '') + ' found';
            // highlightMatches(query);
        }

        // Scroll so the first results are visible
        var firstVisible = termsContainer.querySelector('.pd-entry:not(.pd-hidden)');
        if (firstVisible) firstVisible.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function highlightMatches(query) {
        var tokens = query.toLowerCase().split(/\s+/).filter(function (t) { return t && !stopWords[t]; });
        entries.forEach(function (entry) {
            if (entry.classList.contains('pd-hidden')) return;
            var termEl = entry.querySelector('.pd-entry-term dfn');
            if (termEl) highlightText(termEl, tokens);
            var bodyEl = entry.querySelector('.pd-entry-body');
            if (bodyEl) highlightText(bodyEl, tokens);
        });
    }

    function highlightText(el, tokens) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(function (node) {
            var text = node.textContent;
            var lower = text.toLowerCase();
            var lastIdx = 0;
            var matches = [];

            tokens.forEach(function (token) {
                var idx = lower.indexOf(token);
                while (idx !== -1) {
                    matches.push({ start: idx, end: idx + token.length });
                    idx = lower.indexOf(token, idx + 1);
                }
            });

            if (matches.length === 0) return;
            matches.sort(function (a, b) { return a.start - b.start; });

            var merged = [matches[0]];
            for (var i = 1; i < matches.length; i++) {
                var last = merged[merged.length - 1];
                if (matches[i].start <= last.end) {
                    last.end = Math.max(last.end, matches[i].end);
                } else {
                    merged.push(matches[i]);
                }
            }

            var frag = document.createDocumentFragment();
            merged.forEach(function (m) {
                if (m.start > lastIdx) frag.appendChild(document.createTextNode(text.substring(lastIdx, m.start)));
                var mark = document.createElement('mark');
                mark.textContent = text.substring(m.start, m.end);
                frag.appendChild(mark);
                lastIdx = m.end;
            });
            if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.substring(lastIdx)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    function removeHighlights() {
        root.querySelectorAll('.pd-entry-term mark, .pd-entry-body mark').forEach(function (mark) {
            var parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }

    // Toggle shadow when search bar becomes sticky
    var searchEl = document.querySelector('.pd-search');
    var sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    sentinel.style.marginBottom = '-1px';
    searchEl.parentNode.insertBefore(sentinel, searchEl);
    if (window.IntersectionObserver) {
        var observer = new IntersectionObserver(function (entries) {
            searchEl.classList.toggle('pd-stuck', !entries[0].isIntersecting);
        }, { threshold: 0, rootMargin: '-36px 0px 0px 0px' });
        observer.observe(sentinel);
    }

    // Internal term links: clear search so target entry is visible
    root.addEventListener('click', function (e) {
        var link = e.target.closest('a[href^="#pd-"]');
        if (!link) return;
        if (searchInput.value.trim()) {
            e.preventDefault();
            searchInput.value = '';
            performSearch();
            var target = document.querySelector(link.getAttribute('href'));
            if (target) {
                setTimeout(function () {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            }
        }
    });

    searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performSearch, 200);
    });

    clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        performSearch();
        searchInput.focus();
    });

    alphaNav.addEventListener('click', function () {
        if (searchInput.value.trim()) {
            searchInput.value = '';
            performSearch();
        }
    });

    // Build JSON-LD from the DOM
    var pageUrl = window.location.href.split('#')[0];
    var defined = [];
    var faqEntries = [];

    entries.forEach(function (entry) {
        var name = entry.getAttribute('data-term') || '';
        var bodyEl = entry.querySelector('.pd-entry-body');
        var firstP = bodyEl ? bodyEl.querySelector('p') : null;
        if (name && firstP) {
            defined.push({
                '@type': 'DefinedTerm',
                'name': name,
                'description': firstP.textContent.trim(),
                'url': pageUrl + '#' + entry.id
            });
        }
        // Collect FAQ pairs from Q&A accordion sections
        var qaPairs = entry.querySelectorAll('.pd-details-body p strong');
        qaPairs.forEach(function (strong) {
            var question = strong.textContent.trim();
            var parent = strong.parentNode;
            var br = parent.querySelector('br');
            if (br && br.nextSibling) {
                var answer = '';
                var node = br.nextSibling;
                while (node) {
                    answer += node.textContent;
                    node = node.nextSibling;
                }
                answer = answer.trim();
                if (question && answer) {
                    faqEntries.push({
                        '@type': 'Question',
                        'name': question,
                        'acceptedAnswer': {
                            '@type': 'Answer',
                            'text': answer
                        }
                    });
                }
            }
        });
    });

    var ldData = [{
        '@context': 'https://schema.org',
        '@type': 'DefinedTermSet',
        'name': 'The Peace Dictionary',
        'description': 'A comprehensive glossary of peace and security terminology from the United Nations, covering key terms to help understand the language of diplomacy, peacebuilding, and conflict resolution.',
        'url': pageUrl,
        'mainEntityOfPage': {
            '@type': 'WebPage',
            '@id': pageUrl
        },
        'publisher': {
            '@type': 'Organization',
            'name': 'United Nations',
            'url': 'https://www.un.org'
        },
        'inLanguage': 'en',
        'datePublished': '2026-04-01',
        'dateModified': new Date().toISOString().split('T')[0],
        'hasDefinedTerm': defined
    }];

    if (faqEntries.length > 0) {
        ldData.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': faqEntries
        });
    }

    var ldEl = document.getElementById('pd-ld-json');
    if (ldEl) {
        ldEl.textContent = JSON.stringify(ldData);
    }
})();
