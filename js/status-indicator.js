(function() {
  const statusContainer = document.createElement('div');
  statusContainer.className = 'connection-status-container';
  statusContainer.innerHTML = `
    <div class="status-item"><span id="sb-dot" class="status-dot"></span> Supabase</div>
    <div class="status-item"><span id="line-dot" class="status-dot"></span> LINE</div>
  `;
  document.body.appendChild(statusContainer);

  async function checkSupabase() {
    const dot = document.getElementById('sb-dot');
    dot.className = 'status-dot checking';
    try {
      const sb = window.pvtSupabase?.getClient();
      if (!sb) throw new Error("Client not found");
      const { error } = await sb.from('employees').select('id').limit(1);
      if (error) throw error;
      dot.className = 'status-dot connected';
    } catch(e) {
      dot.className = 'status-dot disconnected';
    }
  }

  async function checkLine() {
    const dot = document.getElementById('line-dot');
    dot.className = 'status-dot checking';
    try {
      // Use the same endpoint as in diagnose-line-supabase.js
      const res = await fetch("/functions/v1/line-send", { method: "POST", body: JSON.stringify({ ping: true }) });
      if (res.ok || res.status === 401) { // 401 means it reached, just auth failed. Which is ok for connectivity check.
        dot.className = 'status-dot connected';
      } else {
        dot.className = 'status-dot disconnected';
      }
    } catch(e) {
      dot.className = 'status-dot disconnected';
    }
  }

  // Initial check
  setTimeout(checkSupabase, 2000);
  setTimeout(checkLine, 2000);
  
  // Periodic check
  setInterval(checkSupabase, 30000);
  setInterval(checkLine, 30000);
})();
