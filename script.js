// Names of the three players. These names correspond to the order of rows
// displayed in the daily entry form. Feel free to customise this array if
// you wish to change or reorder the participants.
const players = ['Max', 'Jordan', 'Gary'];

// Storage key for persisting data in localStorage
const STORAGE_KEY = 'wordGameScoreboard';

// In‑memory representation of all past entries. Each item is an object
// { date: 'YYYY-MM-DD', player: String, wordlePoints: Number, quordlePoints: Number, octordlePoints: Number, totalPoints: Number }
let scoreboard = [];

// Initialise the form and load stored data when the page is ready
document.addEventListener('DOMContentLoaded', () => {
  buildEntryRows();
  // Attempt to load stored data from localStorage and remote GitHub file
  // before rendering the scoreboard. If a remote file is configured and
  // successfully fetched, it will overwrite local storage.
  loadData().then(() => {
    renderScoreboard();
    renderTotals();
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

  // Gather share texts for each player and game and parse into numerical
  // scores. A score of 0 indicates a bust (failure to solve) and will
  // trigger a −1 point penalty later. For Wordle we extract the number of
  // guesses (1–6) from the share string; for Quordle and Octordle we
  // accumulate the individual board guesses (1–9 for Quordle, 1–13 for
  // Octordle). If any board is marked with an X, the entire game is
  // considered a bust (score 0).
  const results = {};
  players.forEach((p) => {
    const wordleShare = document.querySelector(`textarea[data-player="${p}"][data-game="wordle"]`).value.trim();
    const quordleShare = document.querySelector(`textarea[data-player="${p}"][data-game="quordle"]`).value.trim();
    const octordleShare = document.querySelector(`textarea[data-player="${p}"][data-game="octordle"]`).value.trim();
    results[p] = {
      wordle: parseWordleShare(wordleShare),
      quordle: parseQuordleShare(quordleShare),
      octordle: parseOctordleShare(octordleShare),
    };
  });

  // Compute points for each game
  const pointsByPlayer = {};
  players.forEach((p) => {
    pointsByPlayer[p] = { wordle: 0, quordle: 0, octordle: 0, total: 0 };
  });

  // Helper function to calculate game points
  const calculateGamePoints = (game, basePoints) => {
    // Build array of players who have a positive guess (success). 0 indicates bust.
    const validResults = players
      .filter((p) => results[p][game] > 0)
      .map((p) => results[p][game]);
    let winners = [];
    if (validResults.length > 0) {
      const minGuess = Math.min(...validResults);
      winners = players.filter((p) => results[p][game] > 0 && results[p][game] === minGuess);
    }
    const splitPoints = winners.length > 0 ? basePoints / winners.length : 0;
    players.forEach((p) => {
      let pts = 0;
      if (results[p][game] === 0) {
        // bust penalty
        pts = -1;
      } else if (winners.includes(p)) {
        pts = splitPoints;
      } else {
        // guessed but not fastest, no points awarded
        pts = 0;
      }
      pointsByPlayer[p][game] = pts;
      pointsByPlayer[p].total += pts;
    });
  };

  calculateGamePoints('wordle', 1);
  calculateGamePoints('quordle', 2);
  calculateGamePoints('octordle', 3);

  // Build new entries for scoreboard
  players.forEach((p) => {
    scoreboard.push({
      date: dateStr,
      player: p,
      wordlePoints: pointsByPlayer[p].wordle,
      quordlePoints: pointsByPlayer[p].quordle,
      octordlePoints: pointsByPlayer[p].octordle,
      totalPoints: pointsByPlayer[p].total,
    });
  });

  saveData();
  // After persisting locally, attempt to push the update to GitHub if a
  // personal access token has been provided. The remote update occurs
  // asynchronously and does not block UI refresh.
  updateRemoteScoreboard();
  renderScoreboard();
  renderTotals();
  // reset form fields
  document.getElementById('score-form').reset();
}

// Render the scoreboard table based on the in‑memory scoreboard
function renderScoreboard() {
  const tbody = document.getElementById('scoreboard-body');
  tbody.innerHTML = '';
  // Sort by date descending so newest are on top
  const sorted = [...scoreboard].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.player}</td>
      <td>${entry.wordlePoints}</td>
      <td>${entry.quordlePoints}</td>
      <td>${entry.octordlePoints}</td>
      <td>${entry.totalPoints}</td>
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
    // Wordle
    if (entry.wordlePoints > 0) {
      totals[p].wordleWins += 1;
    } else if (entry.wordlePoints < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    // Quordle
    if (entry.quordlePoints > 0) {
      totals[p].quordleWins += 1;
    } else if (entry.quordlePoints < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    // Octordle
    if (entry.octordlePoints > 0) {
      totals[p].octordleWins += 1;
    } else if (entry.octordlePoints < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    totals[p].totalPoints += entry.totalPoints;
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
