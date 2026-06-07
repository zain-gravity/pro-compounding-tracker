/**
 * admin.js — User Login & Super Admin View Controller
 * Manages user identification modal, profile switching, and the admin dashboard.
 */

import { state, setUserInfo, logout, fetchFromDatabase } from '../core/state.js';
import { fmt } from '../core/formatter.js';
import { showToast } from '../components/toast.js';

let allUsersData = []; // Cached admin data

/**
 * Initialize user login modal and admin dashboard listeners.
 */
export function initAdmin() {
  const userModal = document.getElementById('user-modal');
  const loginForm = document.getElementById('user-login-form');
  const usernameInput = document.getElementById('login-username');
  const passcodeGroup = document.getElementById('admin-passcode-group');
  const passcodeInput = document.getElementById('login-passcode');
  const switchUserBtn = document.getElementById('btn-switch-user');
  const closeInspectBtn = document.getElementById('btn-close-inspect');

  // --- Show User Identification modal if no user logged in ---
  if (!state.username) {
    if (userModal) userModal.style.display = 'flex';
  } else {
    updateProfileHeader();
    if (state.isAdmin) {
      showAdminTab();
    }
  }

  // --- Dynamic passcode field toggle ---
  if (usernameInput && passcodeGroup) {
    usernameInput.addEventListener('input', () => {
      const isSuperAdmin = usernameInput.value.trim().toLowerCase() === 'super admin';
      if (isSuperAdmin) {
        passcodeGroup.classList.remove('hidden');
        if (passcodeInput) passcodeInput.required = true;
      } else {
        passcodeGroup.classList.add('hidden');
        if (passcodeInput) {
          passcodeInput.required = false;
          passcodeInput.value = '';
        }
      }
    });
  }

  // --- Login Form Submit ---
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = usernameInput.value.trim();
      const isSuperAdmin = username.toLowerCase() === 'super admin';
      
      if (isSuperAdmin) {
        const passcode = passcodeInput.value;
        
        // Show loading state
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const origText = submitBtn.textContent;
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;

        try {
          // Verify passcode against API
          const res = await fetch(`/api/admin?passcode=${encodeURIComponent(passcode)}`);
          if (!res.ok) {
            throw new Error('Invalid passcode');
          }
          
          // Successful admin login
          await setUserInfo(username, true, passcode);
          
          if (userModal) userModal.style.display = 'none';
          showToast('Welcome back, Super Admin!', 'success');
          updateProfileHeader();
          showAdminTab();
          
          // Navigate to admin view automatically
          const adminTabBtn = document.getElementById('tab-btn-admin');
          if (adminTabBtn) adminTabBtn.click();
        } catch (err) {
          showToast('Authentication failed: Invalid admin passcode', 'error');
        } finally {
          submitBtn.textContent = origText;
          submitBtn.disabled = false;
        }
      } else {
        // Standard user login
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Loading...';
        submitBtn.disabled = true;
        
        try {
          await setUserInfo(username, false, null);
          if (userModal) userModal.style.display = 'none';
          showToast(`Logged in as ${username}`, 'success');
          updateProfileHeader();
          hideAdminTab();
          
          // Force refetch and display compounding results
          location.reload(); // Simple reload to refresh the entire UI with correct state
        } catch (err) {
          showToast('Failed to load profile data', 'error');
          console.error(err);
        } finally {
          submitBtn.disabled = false;
        }
      }
    });
  }

  // --- Switch User / Logout ---
  if (switchUserBtn) {
    switchUserBtn.addEventListener('click', () => {
      logout();
      if (userModal) {
        // Clear input values
        if (usernameInput) usernameInput.value = '';
        if (passcodeInput) passcodeInput.value = '';
        if (passcodeGroup) passcodeGroup.classList.add('hidden');
        userModal.style.display = 'flex';
      }
      hideAdminTab();
      // Go back to compounding tab
      const tabForward = document.getElementById('tab-btn-forward');
      if (tabForward) tabForward.click();
      showToast('Logged out of trader profile', 'info');
    });
  }

  // --- Close Snaphot button ---
  if (closeInspectBtn) {
    closeInspectBtn.addEventListener('click', () => {
      const inspectArea = document.getElementById('admin-inspect-area');
      if (inspectArea) inspectArea.classList.add('hidden');
    });
  }
}

/**
 * Update the profile header with the user's name
 */
export function updateProfileHeader() {
  const badge = document.getElementById('user-profile-badge');
  const nameEl = document.getElementById('display-user-name');
  
  if (badge && nameEl) {
    if (state.username) {
      nameEl.textContent = state.username;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

function showAdminTab() {
  const adminTab = document.getElementById('tab-btn-admin');
  if (adminTab) adminTab.style.display = 'flex';
}

function hideAdminTab() {
  const adminTab = document.getElementById('tab-btn-admin');
  if (adminTab) adminTab.style.display = 'none';
}

/**
 * Fetch and refresh admin dashboard data
 */
export async function refreshAdmin() {
  if (!state.isAdmin || !state.adminPasscode) return;

  const tbody = document.getElementById('admin-traders-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Fetching trader database...</td></tr>`;

  try {
    const res = await fetch(`/api/admin?passcode=${encodeURIComponent(state.adminPasscode)}`);
    if (!res.ok) {
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    allUsersData = data.users || [];

    // --- Render stats ---
    document.getElementById('admin-stat-traders').textContent = allUsersData.length;
    
    const activePlans = allUsersData.filter(u => u.plan).length;
    document.getElementById('admin-stat-plans').textContent = activePlans;
    
    document.getElementById('admin-stat-sync').textContent = new Date().toLocaleTimeString();

    // --- Render table ---
    if (allUsersData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">No registered traders found in the database.</td></tr>`;
      return;
    }

    const rowsHtml = allUsersData.map((user) => {
      const hasPlan = !!user.plan;
      const startAmtText = hasPlan ? fmt(user.plan.params.startAmt) : '—';
      
      // Calculate current balance
      let currentBal = '—';
      const actualKeys = Object.keys(user.actualBalances || {}).map(Number);
      if (actualKeys.length > 0) {
        const lastTradeNum = Math.max(...actualKeys);
        currentBal = fmt(user.actualBalances[lastTradeNum]);
      } else if (hasPlan) {
        currentBal = fmt(user.plan.params.startAmt);
      }

      const completedTradesCount = actualKeys.length;
      const targetText = hasPlan ? fmt(user.plan.rows[user.plan.rows.length - 1].closing) : '—';
      const lastActiveText = user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '—';

      const actionBtn = hasPlan 
        ? `<button class="btn btn-primary btn-xs inspect-btn" data-username="${user.username}" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 4px;">Inspect Sheet</button>`
        : `<span class="text-muted" style="font-size: 0.75rem;">No Plan</span>`;

      return `<tr>
        <td><strong>${user.displayName || user.username}</strong></td>
        <td>${startAmtText}</td>
        <td><strong>${currentBal}</strong></td>
        <td>${completedTradesCount}</td>
        <td>${targetText}</td>
        <td style="font-size: 0.8rem; color: #94a3b8;">${lastActiveText}</td>
        <td>${actionBtn}</td>
      </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;

    // --- Bind inspect buttons ---
    tbody.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetUsername = btn.getAttribute('data-username');
        inspectTrader(targetUsername);
      });
    });

  } catch (err) {
    showToast('Failed to retrieve admin data', 'error');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #f43f5e; padding: 20px;">Error loading data: Unauthorized or Database Offline</td></tr>`;
  }
}

/**
 * Inspect a specific user's compounding tracker
 */
function inspectTrader(username) {
  const user = allUsersData.find(u => u.username === username);
  if (!user || !user.plan) return;

  const inspectArea = document.getElementById('admin-inspect-area');
  const inspectUsername = document.getElementById('admin-inspect-username');
  const startEl = document.getElementById('inspect-start-amount');
  const finalEl = document.getElementById('inspect-final-balance');
  const progressEl = document.getElementById('inspect-progress');
  const tbody = document.getElementById('admin-inspect-tbody');

  if (!inspectArea || !inspectUsername || !startEl || !finalEl || !progressEl || !tbody) return;

  inspectUsername.textContent = user.displayName || user.username;
  startEl.textContent = fmt(user.plan.params.startAmt);
  
  const projectedFinal = user.plan.rows[user.plan.rows.length - 1].closing;
  finalEl.textContent = fmt(projectedFinal);

  // Calculate progress percentage
  const actualKeys = Object.keys(user.actualBalances || {}).map(Number);
  let currentBalanceVal = user.plan.params.startAmt;
  if (actualKeys.length > 0) {
    const lastTradeNum = Math.max(...actualKeys);
    currentBalanceVal = user.actualBalances[lastTradeNum];
  }
  
  const progressPct = ((currentBalanceVal - user.plan.params.startAmt) / (projectedFinal - user.plan.params.startAmt)) * 100;
  progressEl.textContent = `${fmt(currentBalanceVal)} (${progressPct.toFixed(1)}%)`;

  // Render the compounding plan rows
  const rowsHtml = user.plan.rows.map((row) => {
    const tradeNum = row.trade;
    const hasActual = user.actualBalances && user.actualBalances[tradeNum] !== undefined;
    
    let actualText = '—';
    let statusBadge = '';
    let profitClass = 'text-green';
    let profitText = `+${fmt(row.profit)}`;

    if (hasActual) {
      const actual = user.actualBalances[tradeNum];
      actualText = fmt(actual);
      
      const diff = actual - row.closing;
      if (Math.abs(diff) < 0.01) {
        statusBadge = `<span class="alert-badge alert-badge--on-track" style="font-size: 0.7rem; padding: 2px 6px;">On Track</span>`;
      } else if (diff > 0) {
        statusBadge = `<span class="alert-badge alert-badge--ahead" style="font-size: 0.7rem; padding: 2px 6px;">Ahead</span>`;
      } else {
        statusBadge = `<span class="alert-badge alert-badge--behind" style="font-size: 0.7rem; padding: 2px 6px;">Behind</span>`;
      }
    } else {
      statusBadge = `<span class="alert-badge" style="background: rgba(255,255,255,0.05); color: #94a3b8; font-size: 0.7rem; padding: 2px 6px;">Projected</span>`;
    }

    // Fees cell
    let feesText = '—';
    let feesClass = '';
    if (row.fees > 0) {
      feesText = `-${fmt(row.fees)}`;
      feesClass = 'text-red';
    }

    return `<tr>
      <td>${tradeNum}</td>
      <td>${fmt(row.opening)}</td>
      <td class="${profitClass}">${profitText}</td>
      <td class="${feesClass}">${feesText}</td>
      <td><strong>${hasActual ? actualText : fmt(row.closing)}</strong></td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // Reveal inspection card
  inspectArea.classList.remove('hidden');
  inspectArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
