// Names of the three players. These names correspond to the order of rows
// displayed in the daily entry form. Feel free to customise this array if
// you wish to change or reorder the participants.
const players = ['Max', 'Jordan', 'Gary'];

// Storage key for persisting data in localStorage
const STORAGE_KEY = 'wordGameScoreboard';

// In‑memory representation of all past entries. Each item is an object
// { date: 'YYYY-MM-DD', player: String, wordlePoints: Number, quordlePoints: Number, octordlePoints: Number, totalPoints: Number }
let scoreboard = [];

/**
 * On first run of the updated site (v2), clear any legacy scoreboard data
 * that does not include the share strings and puzzle numbers. Older
 * versions stored entries without these fields, which will break the new
 * scoring logic. A marker key in localStorage ensures the purge only
 * happens once per device. If a valid scoreboard is detected this
 * function does nothing.
 */
function clearOldStorageIfNeeded() {
  const markerKey = 'scoreboardClearedV2';
  if (localStorage.getItem(markerKey)) {
    return;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (Array.isArray(data) && data.length > 0) {
        const sample = data[0];
        // If the entry does not include share fields or puzzle numbers, wipe
        const missingFields = !('wordleShare' in sample) || !('quordleShare' in sample) || !('octordleShare' in sample);
        const missingPuzzles = !('wordlePuzzle' in sample) || !('quordlePuzzle' in sample) || !('octordlePuzzle' in sample);
        if (missingFields || missingPuzzles) {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  } catch (err) {
    // If parsing fails, clear the corrupt data
    localStorage.removeItem(STORAGE_KEY);
  }
  localStorage.setItem(markerKey, 'true');
}

// Initialise the form and load stored data when the page is ready
document.addEventListener('DOMContentLoaded', () => {
      // Remove any stale data from older versions of this site (pre‑v2). This
      // ensures that previously stored scoreboard entries that do not contain
      // share results or puzzle numbers are cleared. The operation runs only
      // once per device thanks to a marker in localStorage.
      clearOldStorageIfNeeded();

      buildEntryRows();
  // Attempt to load stored data from localStorage and remote GitHub file
  // before rendering the scoreboard. If a remote file is configured and
  // successfully fetched, it will overwrite local storage.
  loadData().then(() => {
    renderScoreboard();
    renderTotals();
    // Show today's results if any exist. This ensures the daily results
    // section always reflects the current date when the page loads.
    const todayStr = new Date().toISOString().split('T')[0];
    renderDailyResults(todayStr);
  });

  document.getElementById('add-button').addEventListener('click', handleAdd);

  // Initialise default remote settings. These variables can be updated
  // through the remote settings form in the UI. By default we enable
  // remote scoreboard to pull data from GitHub. Writing updates back to
  // GitHub requires a personal access token.
  window.githubOwner = window.githubOwner || 'felatedbirthday';
  window.githubRepo = window.githubRepo || 'Ordler';
  window.githubFilePath = window.githubFilePath || 'scoreboard.json';
  // Use the default branch of this repository (GitHub sometimes names it "root" when no main branch exists).
  // Adjust this to match the branch where scoreboard.json will reside.
  window.githubBranch = window.githubBranch || 'root';
  window.useRemoteScoreboard = typeof window.useRemoteScoreboard === 'boolean' ? window.useRemoteScoreboard : true;

  // Populate remote form with previously saved token if present
  const tokenInput = document.getElementById('github-token');
  const enableRemoteCheckbox = document.getElementById('enable-remote');
  if (tokenInput) {
    tokenInput.value = localStorage.getItem('githubToken') || '';
  }
  if (enableRemoteCheckbox) {
    enableRemoteCheckbox.checked = window.useRemoteScoreboard;
  }
  // Save remote settings when the user clicks the button
  const remoteSaveButton = document.getElementById('remote-save-button');
  if (remoteSaveButton) {
    remoteSaveButton.addEventListener('click', () => {
      const enabled = enableRemoteCheckbox.checked;
      const tok = tokenInput.value.trim();
      window.useRemoteScoreboard = enabled;
      if (tok) {
        window.githubToken = tok;
        localStorage.setItem('githubToken', tok);
      }
      // If disabling remote sync we clear token from memory but keep it in localStorage
      if (!enabled) {
        window.githubToken = undefined;
      }
      // Reload scoreboard from remote or local depending on new setting
      loadData().then(() => {
        renderScoreboard();
        renderTotals();
        // Automatically display the daily results for the most recent date
        // once the scoreboard has been loaded. This shows the latest day's
        // raw share results if available.
        if (scoreboard.length > 0) {
          // Scoreboard is sorted in renderScoreboard but not necessarily here;
          // find the max date in the existing entries.
          const dates = scoreboard.map((e) => e.date);
          const latestDate = dates.sort().reverse()[0];
          renderDailyResults(latestDate);
        }
      });
      alert('Remote settings saved.');
    });
  }
});

    // Build table rows for each player in the daily entry form
function buildEntryRows() {
  const tbody = document.getElementById('entry-table-body');
  tbody.innerHTML = '';
  players.forEach((p) => {
    const tr = document.createElement('tr');
    // Each row contains the player's name and three textareas where they
    // can paste their share results from Wordle, Quordle and Octordle.
    tr.innerHTML = `
      <td>${p}</td>
      <td><textarea rows="3" data-player="${p}" data-game="wordle" placeholder="Paste your Wordle share result here"></textarea></td>
      <td><textarea rows="3" data-player="${p}" data-game="quordle" placeholder="Paste your Quordle share result here"></textarea></td>
      <td><textarea rows="3" data-player="${p}" data-game="octordle" placeholder="Paste your Octordle share result here"></textarea></td>
    `;
    tbody.appendChild(tr);
  });
}

// Handle the click on “Add Today's Score”
function handleAdd() {
  const today = new Date();
  // Use locale date in ISO format (YYYY-MM-DD). toLocaleDateString with ISO locale
  const dateStr = today.toISOString().split('T')[0];

  // Check if an entry for this date already exists. Scoreboard holds one row per player per date, so we search by date and the first player.
  const existingIndex = scoreboard.findIndex((entry) => entry.date === dateStr && entry.player === players[0]);
  if (existingIndex !== -1) {
    const overwrite = window.confirm('An entry for today already exists. Do you want to overwrite it?');
    if (!overwrite) {
      return;
    }

    // Remove all entries for this date
    scoreboard = scoreboard.filter((entry) => entry.date !== dateStr);
  }

  // Gather share texts for each player and game and parse into numerical scores
  // and puzzle identifiers. A guess count of 0 indicates a bust (failure to
  // solve). Players can submit their own results at different times; we will
  // accept whatever share strings are provided and save them. Points will be
  // calculated only when all three players have submitted results for the
  // same date and the puzzle numbers match.
  const results = {};
  let wordlePuzzleCandidates = [];
  let quordlePuzzleCandidates = [];
  let octordlePuzzleCandidates = [];

  players.forEach((p) => {
    const wordleShare = document
      .querySelector(`textarea[data-player="${p}"][data-game="wordle"]`)
      .value.trim();
    const quordleShare = document
      .querySelector(`textarea[data-player="${p}"][data-game="quordle"]`)
      .value.trim();
    const octordleShare = document
      .querySelector(`textarea[data-player="${p}"][data-game="octordle"]`)
      .value.trim();
    // If a player provided any share strings, parse them; otherwise leave
    // results undefined for that player. Partial submissions are allowed.
    if (wordleShare || quordleShare || octordleShare) {
      const parsedW = parseWordleShareDetailed(wordleShare);
      const parsedQ = parseQuordleShareDetailed(quordleShare);
      const parsedO = parseOctordleShareDetailed(octordleShare);
      results[p] = {
        wordle: parsedW.guesses,
        quordle: parsedQ.guesses,
        octordle: parsedO.guesses,
        wordleShare,
        quordleShare,
        octordleShare,
        wordlePuzzle: parsedW.puzzle,
        quordlePuzzle: parsedQ.puzzle,
        octordlePuzzle: parsedO.puzzle,
      };
      if (parsedW.puzzle !== null) wordlePuzzleCandidates.push(parsedW.puzzle);
      if (parsedQ.puzzle !== null) quordlePuzzleCandidates.push(parsedQ.puzzle);
      if (parsedO.puzzle !== null) octordlePuzzleCandidates.push(parsedO.puzzle);
    }
  });

  // For each player with provided results, create or update the scoreboard entry for today
  Object.keys(results).forEach((p) => {
    // Find if an entry already exists for this date and player
    const existingIndex = scoreboard.findIndex(
      (entry) => entry.date === dateStr && entry.player === p
    );
    const res = results[p];
    if (existingIndex !== -1) {
      // Update existing entry with new share strings and puzzle numbers; leave points untouched for now
      const entry = scoreboard[existingIndex];
      entry.wordleShare = res.wordleShare;
      entry.quordleShare = res.quordleShare;
      entry.octordleShare = res.octordleShare;
      entry.wordlePuzzle = res.wordlePuzzle;
      entry.quordlePuzzle = res.quordlePuzzle;
      entry.octordlePuzzle = res.octordlePuzzle;
      // Reset points to null to ensure they will be recomputed once all players submit
      entry.wordlePoints = null;
      entry.quordlePoints = null;
      entry.octordlePoints = null;
      entry.totalPoints = null;
    } else {
      // Create a new entry with points unset (null)
      scoreboard.push({
        date: dateStr,
        player: p,
        wordlePoints: null,
        quordlePoints: null,
        octordlePoints: null,
        totalPoints: null,
        wordleShare: res.wordleShare,
        quordleShare: res.quordleShare,
        octordleShare: res.octordleShare,
        wordlePuzzle: res.wordlePuzzle,
        quordlePuzzle: res.quordlePuzzle,
        octordlePuzzle: res.octordlePuzzle,
      });
    }
  });

  // After saving partial submissions, check if all players have provided
  // results for this date. Only then do we compute points. Also check if
  // puzzle numbers match across all entries.
  const entriesForDate = scoreboard.filter((e) => e.date === dateStr);
  const allPlayersPresent = players.every((p) => {
    return entriesForDate.some((e) => e.player === p && e.wordleShare && e.quordleShare && e.octordleShare);
  });
  let computePoints = false;
  let wordlePuzzle = null;
  let quordlePuzzle = null;
  let octordlePuzzle = null;
  if (allPlayersPresent) {
    // Determine if puzzle numbers match across players. If any mismatch or
    // missing puzzles, we will not compute points yet.
    const puzzlesMatch = (game) => {
      const puzzles = entriesForDate
        .map((e) => e[`${game}Puzzle`])
        .filter((n) => n !== null && n !== undefined);
      if (puzzles.length !== players.length) {
        return false;
      }
      return puzzles.every((v) => v === puzzles[0]);
    };
    if (puzzlesMatch('wordle') && puzzlesMatch('quordle') && puzzlesMatch('octordle')) {
      computePoints = true;
      // Use the first entry's puzzle numbers for saving
      const refEntry = entriesForDate[0];
      wordlePuzzle = refEntry.wordlePuzzle;
      quordlePuzzle = refEntry.quordlePuzzle;
      octordlePuzzle = refEntry.octordlePuzzle;
    }
  }

  if (computePoints) {
    // Build a results object keyed by player for computing points
    const tempResults = {};
    players.forEach((p) => {
      const entry = entriesForDate.find((e) => e.player === p);
      tempResults[p] = {
        wordle: parseWordleShareDetailed(entry.wordleShare).guesses,
        quordle: parseQuordleShareDetailed(entry.quordleShare).guesses,
        octordle: parseOctordleShareDetailed(entry.octordleShare).guesses,
      };
    });
    // Compute points as before using updated logic. Points will be
    // calculated only if at least one player solved the puzzle. A bust (0
    // guesses) incurs a −1 penalty only when someone solved. Points are
    // divided among winners with minimal guess counts.
    const pointsByPlayer = {};
    players.forEach((p) => {
      pointsByPlayer[p] = { wordle: 0, quordle: 0, octordle: 0, total: 0 };
    });
    const calculateGamePoints = (game, basePoints) => {
      const validResults = players
        .filter((p) => tempResults[p][game] > 0)
        .map((p) => tempResults[p][game]);
      let winners = [];
      const hasSolver = validResults.length > 0;
      if (hasSolver) {
        const minGuess = Math.min(...validResults);
        winners = players.filter(
          (p) => tempResults[p][game] > 0 && tempResults[p][game] === minGuess
        );
      }
      const splitPoints = hasSolver && winners.length > 0 ? basePoints / winners.length : 0;
      players.forEach((p) => {
        let pts;
        if (tempResults[p][game] === 0) {
          pts = hasSolver ? -1 : 0;
        } else if (winners.includes(p)) {
          pts = splitPoints;
        } else {
          pts = 0;
        }
        pointsByPlayer[p][game] = pts;
        pointsByPlayer[p].total += pts;
      });
    };
    calculateGamePoints('wordle', 1);
    calculateGamePoints('quordle', 2);
    calculateGamePoints('octordle', 3);
    // Apply points back to entries
    entriesForDate.forEach((entry) => {
      const p = entry.player;
      entry.wordlePoints = pointsByPlayer[p].wordle;
      entry.quordlePoints = pointsByPlayer[p].quordle;
      entry.octordlePoints = pointsByPlayer[p].octordle;
      entry.totalPoints = pointsByPlayer[p].total;
      entry.wordlePuzzle = wordlePuzzle;
      entry.quordlePuzzle = quordlePuzzle;
      entry.octordlePuzzle = octordlePuzzle;
    });
  }

  // Persist and update UI
  saveData();
  updateRemoteScoreboard();
  renderScoreboard();
  renderTotals();
  renderDailyResults(dateStr);

  // Clear only the textareas for players who submitted results. This
  // prevents inadvertently wiping entries for players who haven’t played yet.
  Object.keys(results).forEach((p) => {
    ['wordle', 'quordle', 'octordle'].forEach((game) => {
      const ta = document.querySelector(`textarea[data-player="${p}"][data-game="${game}"]`);
      if (ta) ta.value = '';
    });
  });
}

// Render the scoreboard table based on the in‑memory scoreboard
function renderScoreboard() {
  const tbody = document.getElementById('scoreboard-body');
  tbody.innerHTML = '';
  // Sort by date descending so newest are on top
  const sorted = [...scoreboard].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((entry) => {
    const row = document.createElement('tr');
    // When points are null (not yet computed), display a dash. Otherwise
    // display the number. Total points should be formatted to two decimals if
    // not null.
    const fmt = (val, isTotal = false) => {
      if (val === null || val === undefined) return '—';
      return isTotal ? val.toFixed(2) : val;
    };
    row.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.player}</td>
      <td>${fmt(entry.wordlePoints)}</td>
      <td>${fmt(entry.quordlePoints)}</td>
      <td>${fmt(entry.octordlePoints)}</td>
      <td>${fmt(entry.totalPoints, true)}</td>
    `;
    tbody.appendChild(row);
  });
}

// Render cumulative totals (wins, losses, busts and total points) per player
function renderTotals() {
  const tbody = document.getElementById('totals-body');
  tbody.innerHTML = '';
  const totals = {};
  players.forEach((p) => {
    totals[p] = {
      wordleWins: 0,
      quordleWins: 0,
      octordleWins: 0,
      losses: 0,
      busts: 0,
      totalPoints: 0,
    };
  });
  // Compute wins/losses/busts and accumulate points
  scoreboard.forEach((entry) => {
    const p = entry.player;
    // Skip entries that have not been scored yet (null points)
    const w = entry.wordlePoints;
    const q = entry.quordlePoints;
    const o = entry.octordlePoints;
    const t = entry.totalPoints;
    if (w === null || q === null || o === null || t === null) {
      return;
    }
    // Wordle
    if (w > 0) {
      totals[p].wordleWins += 1;
    } else if (w < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    // Quordle
    if (q > 0) {
      totals[p].quordleWins += 1;
    } else if (q < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    // Octordle
    if (o > 0) {
      totals[p].octordleWins += 1;
    } else if (o < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    totals[p].totalPoints += t;
  });
  players.forEach((p) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p}</td>
      <td>${totals[p].wordleWins}</td>
      <td>${totals[p].quordleWins}</td>
      <td>${totals[p].octordleWins}</td>
      <td>${totals[p].losses}</td>
      <td>${totals[p].busts}</td>
      <td>${totals[p].totalPoints.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

// Persist the scoreboard to localStorage
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scoreboard));
  } catch (e) {
    console.error('Could not save data to localStorage', e);
  }
}

// Load the scoreboard from localStorage and, if configured, from a remote
// GitHub repository. If the remote file fetch succeeds it will
// overwrite any local data. Returns a promise that resolves when the
// loading operations are finished.
async function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      scoreboard = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Could not load data from localStorage', e);
    scoreboard = [];
  }
  // Attempt to fetch the remote scoreboard if a repo has been configured
  if (window.useRemoteScoreboard) {
    try {
      const url = `https://raw.githubusercontent.com/${window.githubOwner}/${window.githubRepo}/${window.githubBranch || 'root'}/${window.githubFilePath || 'scoreboard.json'}?cacheBust=${Date.now()}`;
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        // If file is empty, ignore
        if (text) {
          const remoteData = JSON.parse(text);
          if (Array.isArray(remoteData)) {
            scoreboard = remoteData;
            // Persist remote data locally so it shows when offline
            saveData();
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch remote scoreboard', err);
    }
  }
}

// Helper: parse the first line of a Wordle share result and return a
// numeric guess count. If the share indicates a failure (X/6) or does not
// contain a recognizable pattern, returns 0. Examples of supported
// formats: "Wordle 234 4/6", "Wordle 287 X/6" or lines containing
// "3/6".
function parseWordleShare(share) {
  if (!share) return 0;
  // Extract pattern like "4/6" or "X/6" from the first line
  const lines = share.split(/\n|\r/);
  const first = lines.find((l) => l.trim().length > 0) || '';
  const match = first.match(/([0-9Xx])\s*\/\s*6/);
  if (match) {
    const val = match[1];
    if (val.toLowerCase() === 'x') return 0;
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// Helper: parse a Quordle share string and return the total number of
// guesses across all four boards. If any board shows an X (failure)
// the game is treated as a bust and 0 is returned. Example inputs:
// "8️⃣5️⃣7️⃣6️⃣", "Quordle 1234\n6 7 8 9", etc. It will extract
// digits 0–9 or X and sum them. Unrecognised characters are ignored.
function parseQuordleShare(share) {
  if (!share) return 0;
  const chars = Array.from(share);
  let total = 0;
  let hasFail = false;
  chars.forEach((ch) => {
    // Replace emoji digits (e.g., 1️⃣) with the underlying number
    const digit = emojiToNumber(ch);
    if (digit !== null) {
      total += digit;
    } else if (/X/i.test(ch)) {
      hasFail = true;
    }
  });
  // If there are exactly 4 numbers and no fail mark, return total; otherwise treat as bust
  return hasFail || total === 0 ? 0 : total;
}

// Helper: parse an Octordle share string and return the total number of
// guesses across all eight boards. If any board shows an X (failure)
// the game is treated as a bust and 0 is returned. Digits beyond 9
// (using 0–9 and A–M in hex or emoji) will not occur but we allow
// digits 0–9 and treat X/x as failure. Returns sum of digits or 0.
function parseOctordleShare(share) {
  if (!share) return 0;
  const chars = Array.from(share);
  let total = 0;
  let hasFail = false;
  chars.forEach((ch) => {
    const digit = emojiToNumber(ch);
    if (digit !== null) {
      total += digit;
    } else if (/X/i.test(ch)) {
      hasFail = true;
    }
  });
  // We expect eight numbers. If not eight or a fail occurs, treat as bust.
  return hasFail || total === 0 ? 0 : total;
}

// Convert an emoji digit like "1️⃣" to the underlying number, or a
// normal digit character '1' to number. Returns null for any non
// numeric character. Only supports 0–9.
function emojiToNumber(ch) {
  // Emoji digits use variation selectors. Remove any variation selectors.
  const normalized = ch.replace(/\uFE0F/g, '');
  // Map emoji digits to plain digits
  const emojiMap = {
    '0️⃣': 0,
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
  };
  if (emojiMap.hasOwnProperty(normalized)) {
    return emojiMap[normalized];
  }
  // Plain numeric character
  if (/^[0-9]$/.test(normalized)) {
    return parseInt(normalized, 10);
  }
  return null;
}

    /**
     * Parse a Wordle share string and return both the number of guesses and the
     * puzzle number. If the share indicates a failure (X/6) the guess count
     * returned is 0 and the puzzle number is extracted from the first line
     * where possible. Commas in the puzzle number (e.g., "1,234") are
     * removed prior to parsing. If no puzzle identifier can be determined
     * the `puzzle` property will be null.
     * @param {string} share
     * @returns {{guesses: number, puzzle: (number|null)}}
     */
    function parseWordleShareDetailed(share) {
      if (!share) return { guesses: 0, puzzle: null };
      const lines = share.split(/\n|\r/).filter((l) => l.trim().length > 0);
      const first = lines[0] || '';
      // Extract puzzle number after the word "Wordle" (allowing commas)
      let puzzle = null;
      const puzzleMatch = first.match(/Wordle\s+([0-9,]+)/i);
      if (puzzleMatch) {
        const clean = puzzleMatch[1].replace(/,/g, '');
        const num = parseInt(clean, 10);
        if (!Number.isNaN(num)) puzzle = num;
      }
      // Extract the guess pattern like "4/6" or "X/6" from the first line.
      // If no pattern is found, treat it as a very high guess (not a bust)
      // so that non‑matching results do not incur a –1 penalty. A proper
      // failure share uses "X/6" which will still return 0.
      let guesses = 0;
      const guessMatch = first.match(/([0-9Xx])\s*\/\s*6/);
      if (guessMatch) {
        const val = guessMatch[1];
        if (val.toLowerCase() === 'x') {
          guesses = 0;
        } else {
          const num = parseInt(val, 10);
          guesses = Number.isNaN(num) ? 0 : num;
        }
      } else {
        // No guess pattern detected; assign a high number to mark as solved but not a bust
        guesses = 99;
      }
      return { guesses, puzzle };
    }

    /**
     * Parse a Quordle share string and return both the total number of guesses
     * across all four boards and the puzzle number. Puzzle numbers are
     * extracted from patterns like "Daily Quordle 1234" or "Quordle 1234" or
     * "Quordle #1234". If a failure marker (X/x) is found the guess count is
     * 0. If a puzzle identifier cannot be detected the puzzle property will
     * be null.
     * @param {string} share
     * @returns {{guesses: number, puzzle: (number|null)}}
     */
    function parseQuordleShareDetailed(share) {
      if (!share) return { guesses: 0, puzzle: null };
      // Guess count uses existing helper which returns 0 on bust or unknown
      const rawGuesses = parseQuordleShare(share);
      // If no digits were detected but there is no explicit fail marker (X),
      // treat the game as solved with a high guess count instead of a bust. This
      // prevents players from receiving a −1 penalty when the parser fails to
      // recognise their digit lines. A true bust is indicated with an X in the
      // share text and will remain at 0.
      let guesses = rawGuesses;
      if (rawGuesses === 0) {
        const hasFail = /X/i.test(share);
        if (!hasFail) {
          guesses = 99;
        }
      }
      let puzzle = null;
      const match = share.match(/Quordle\s+(?:#)?(\d+)/i) || share.match(/Daily\s+Quordle\s+(?:#)?(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num)) puzzle = num;
      }
      return { guesses, puzzle };
    }

    /**
     * Parse an Octordle share string and return both the total number of guesses
     * across all eight boards and the puzzle number. Puzzle numbers are
     * extracted from patterns like "Daily Octordle #1234" or "Octordle #1234".
     * If a failure marker (X/x) is found the guess count is 0. If a puzzle
     * identifier cannot be detected the puzzle property will be null.
     * @param {string} share
     * @returns {{guesses: number, puzzle: (number|null)}}
     */
    function parseOctordleShareDetailed(share) {
      if (!share) return { guesses: 0, puzzle: null };
      const rawGuesses = parseOctordleShare(share);
      // Similar to Quordle parsing: if no digits were detected and there is no
      // explicit fail marker, assign a high guess count. This avoids marking
      // ambiguous shares as busts and issuing unnecessary −1 penalties.
      let guesses = rawGuesses;
      if (rawGuesses === 0) {
        const hasFail = /X/i.test(share);
        if (!hasFail) {
          guesses = 99;
        }
      }
      let puzzle = null;
      // Match both forms: "Daily Octordle #1234" or "Octordle #1234"
      const match = share.match(/Octordle\s*(?:#)?(\d+)/i) || share.match(/Daily\s+Octordle\s*(?:#)?(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num)) puzzle = num;
      }
      return { guesses, puzzle };
    }

/**
 * Render the daily results section for a given date. This section shows
 * each player's raw share strings for Wordle, Quordle and Octordle for
 * the selected day. If no entries exist for the date the section will be
 * cleared. The share strings are displayed in a <pre> block to preserve
 * whitespace and emoji formatting.
 * @param {string} dateStr ISO date string (YYYY‑MM‑DD)
 */
function renderDailyResults(dateStr) {
  const container = document.getElementById('daily-results-container');
  if (!container) return;
  container.innerHTML = '';
  // Filter scoreboard for entries matching the given date
  const entries = scoreboard.filter((entry) => entry.date === dateStr);
  if (entries.length === 0) return;
  players.forEach((p) => {
    const entry = entries.find((e) => e.player === p);
    if (entry) {
      const card = document.createElement('div');
      card.className = 'player-result';
      const sections = [];
      if (entry.wordleShare) {
        sections.push('Wordle\n' + entry.wordleShare.trim());
      }
      if (entry.quordleShare) {
        sections.push('Quordle\n' + entry.quordleShare.trim());
      }
      if (entry.octordleShare) {
        sections.push('Octordle\n' + entry.octordleShare.trim());
      }
      card.innerHTML = `<h3>${p}</h3><pre>${sections.join('\n\n')}</pre>`;
      container.appendChild(card);
    }
  });
}

// Update the remote scoreboard file in GitHub if a token has been
// provided. This uses the GitHub API to fetch the existing file's SHA and
// then creates or updates it. If no token is provided or remote is not
// configured, it silently resolves. This function is asynchronous but
// errors are caught to avoid unhandled promise rejections.
async function updateRemoteScoreboard() {
  // Only run if a token is defined and remote scoreboard usage is enabled
  if (!window.useRemoteScoreboard) return;
  const token = window.githubToken || localStorage.getItem('githubToken');
  const owner = window.githubOwner;
  const repo = window.githubRepo;
  const filePath = window.githubFilePath || 'scoreboard.json';
  // Default to 'root' branch if no branch specified
  const branch = window.githubBranch || 'root';
  if (!token || !owner || !repo) return;
  try {
    // Fetch file metadata to obtain the current SHA
    const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    let sha = null;
    if (metaRes.ok) {
      const metaJson = await metaRes.json();
      sha = metaJson.sha;
    }
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(scoreboard, null, 2))));
    const body = {
      message: 'Update scoreboard',
      content,
      branch,
    };
    if (sha) body.sha = sha;
    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    // Optionally handle response status here. Non‑OK statuses are logged.
    if (!putRes.ok) {
      console.warn('Failed to update remote scoreboard', await putRes.text());
    }
  } catch (err) {
    console.warn('Error updating remote scoreboard', err);
  }
}