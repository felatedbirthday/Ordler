const players = ['Me', 'Step Brother', 'Dad'];

const STORAGE_KEY = 'wordGameScoreboard';

let scoreboard = [];

document.addEventListener('DOMContentLoaded', () => {
  buildEntryRows();
  loadData();
  renderScoreboard();
  renderTotals();

  document.getElementById('add-button').addEventListener('click', handleAdd);
});

function buildEntryRows() {
  const tbody = document.getElementById('entry-table-body');
  tbody.innerHTML = '';
  players.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p}</td>
      <td><input type="number" min="0" max="6" data-player="${p}" data-game="wordle" placeholder="0-6"></td>
      <td><input type="number" min="0" max="9" data-player="${p}" data-game="quordle" placeholder="0-9"></td>
      <td><input type="number" min="0" max="13" data-player="${p}" data-game="octordle" placeholder="0-13"></td>
    `;
    tbody.appendChild(tr);
  });
}

function handleAdd() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  const existingIndex = scoreboard.findIndex((entry) => entry.date === dateStr && entry.player === players[0]);
  if (existingIndex !== -1) {
    const overwrite = window.confirm('An entry for today already exists. Do you want to overwrite it?');
    if (!overwrite) {
      return;
    }
    scoreboard = scoreboard.filter((entry) => entry.date !== dateStr);
  }

  const results = {};
  players.forEach((p) => {
    const wordleInput = document.querySelector(`input[data-player="${p}"][data-game="wordle"]`).value;
    const quordleInput = document.querySelector(`input[data-player="${p}"][data-game="quordle"]`).value;
    const octordleInput = document.querySelector(`input[data-player="${p}"][data-game="octordle"]`).value;
    const wordle = parseInt(wordleInput, 10) || 0;
    const quordle = parseInt(quordleInput, 10) || 0;
    const octordle = parseInt(octordleInput, 10) || 0;
    results[p] = { wordle, quordle, octordle };
  });

  const pointsByPlayer = {};
  players.forEach((p) => {
    pointsByPlayer[p] = { wordle: 0, quordle: 0, octordle: 0, total: 0 };
  });

  const calculateGamePoints = (game, basePoints) => {
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
        pts = -1;
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
  renderScoreboard();
  renderTotals();
  document.getElementById('score-form').reset();
}

function renderScoreboard() {
  const tbody = document.getElementById('scoreboard-body');
  tbody.innerHTML = '';
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
  scoreboard.forEach((entry) => {
    const p = entry.player;
    if (entry.wordlePoints > 0) {
      totals[p].wordleWins += 1;
    } else if (entry.wordlePoints < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
    if (entry.quordlePoints > 0) {
      totals[p].quordleWins += 1;
    } else if (entry.quordlePoints < 0) {
      totals[p].busts += 1;
    } else {
      totals[p].losses += 1;
    }
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

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scoreboard));
  } catch (e) {
    console.error('Could not save data to localStorage', e);
  }
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      scoreboard = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Could not load data from localStorage', e);
    scoreboard = [];
  }
}
