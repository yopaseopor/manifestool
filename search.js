// Search functionality
document.getElementById('searchBtn').addEventListener('click', function() {
  const query = document.getElementById('searchInput').value;
  if (query) {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10`)
      .then(response => response.json())
      .then(data => {
        const resultsUl = document.getElementById('results');
        resultsUl.innerHTML = '';
        if (data.length > 0) {
          data.forEach((result, index) => {
            const li = document.createElement('li');
            li.textContent = result.display_name;
            li.addEventListener('click', function() {
              // Send message to parent window to handle map operations
              window.parent.postMessage({
                type: 'searchResultClick',
                bbox: result.boundingbox
              }, '*');
            });
            resultsUl.appendChild(li);
          });
        } else {
          resultsUl.innerHTML = '<li>No results found</li>';
        }
      })
      .catch(error => {
        console.error('Search error:', error);
        alert('Search failed');
      });
  }
});
