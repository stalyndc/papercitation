export default {
    async fetch(request, env, ctx) {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
  
      // Only allow POST requests
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
      try {
        const { claim, style = 'apa' } = await request.json();
  
        if (!claim || claim.trim().length === 0) {
          return new Response(JSON.stringify({ error: 'Please provide a claim to find sources for' }), {
            status: 400,
            headers: corsHeaders(),
          });
        }
  
        // Step 1: Use Gemini to generate search terms
        const searchTerms = await generateSearchTerms(claim, env.GEMINI_API_KEY);
  
        // Step 2: Search OpenAlex for papers
        const papers = await searchOpenAlex(searchTerms);
  
        // Step 3: Format citations
        const results = papers.map(paper => ({
          title: paper.title,
          authors: formatAuthors(paper.authorships),
          year: paper.publication_year,
          journal: paper.primary_location?.source?.display_name || 'Unknown Source',
          doi: paper.doi,
          url: paper.doi || paper.primary_location?.landing_page_url || null,
          citations: {
            apa: formatAPA(paper),
            mla: formatMLA(paper),
            chicago: formatChicago(paper),
          },
          relevance: paper.relevance_score || null,
        }));
  
        return new Response(JSON.stringify({ results, searchTerms }), {
          headers: corsHeaders(),
        });
  
      } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
          status: 500,
          headers: corsHeaders(),
        });
      }
    },
  };
  
  function corsHeaders() {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };
  }
  
  async function generateSearchTerms(claim, apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Convert this claim into 2-4 academic search keywords. Return ONLY the keywords separated by spaces, nothing else. No explanations, no quotes, no punctuation except spaces.
  
  Claim: "${claim}"
  
  Keywords:`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 50,
          }
        }),
      }
    );
  
    const data = await response.json();
    const keywords = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || claim;
    return keywords;
  }
  
  async function searchOpenAlex(searchTerms) {
    const encoded = encodeURIComponent(searchTerms);
    const url = `https://api.openalex.org/works?search=${encoded}&per_page=5&sort=relevance_score:desc&filter=has_doi:true,type:article`;
  
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PaperCitation (https://papercitation.com; mailto:hello@papercitation.com)',
      },
    });
  
    const data = await response.json();
    return data.results || [];
  }
  
  function formatAuthors(authorships) {
    if (!authorships || authorships.length === 0) return [];
    return authorships.map(a => ({
      name: a.author?.display_name || 'Unknown Author',
      first: a.author?.display_name?.split(' ').pop() || '',
      last: a.author?.display_name?.split(' ').slice(0, -1).join(' ') || '',
    }));
  }
  
  function formatAPA(paper) {
    const authors = paper.authorships || [];
    const year = paper.publication_year || 'n.d.';
    const title = paper.title || 'Untitled';
    const journal = paper.primary_location?.source?.display_name || '';
    const doi = paper.doi || '';
  
    let authorStr = '';
    if (authors.length === 0) {
      authorStr = 'Unknown Author';
    } else if (authors.length === 1) {
      const name = authors[0].author?.display_name || 'Unknown';
      const parts = name.split(' ');
      const lastName = parts.pop();
      const initials = parts.map(p => p[0] + '.').join(' ');
      authorStr = `${lastName}, ${initials}`;
    } else if (authors.length === 2) {
      authorStr = authors.map(a => {
        const name = a.author?.display_name || 'Unknown';
        const parts = name.split(' ');
        const lastName = parts.pop();
        const initials = parts.map(p => p[0] + '.').join(' ');
        return `${lastName}, ${initials}`;
      }).join(' & ');
    } else {
      const firstAuthor = authors[0].author?.display_name || 'Unknown';
      const parts = firstAuthor.split(' ');
      const lastName = parts.pop();
      const initials = parts.map(p => p[0] + '.').join(' ');
      authorStr = `${lastName}, ${initials} et al.`;
    }
  
    let citation = `${authorStr} (${year}). ${title}.`;
    if (journal) citation += ` *${journal}*.`;
    if (doi) citation += ` ${doi}`;
  
    return citation;
  }
  
  function formatMLA(paper) {
    const authors = paper.authorships || [];
    const year = paper.publication_year || 'n.d.';
    const title = paper.title || 'Untitled';
    const journal = paper.primary_location?.source?.display_name || '';
    const doi = paper.doi || '';
  
    let authorStr = '';
    if (authors.length === 0) {
      authorStr = 'Unknown Author';
    } else if (authors.length === 1) {
      const name = authors[0].author?.display_name || 'Unknown';
      const parts = name.split(' ');
      const lastName = parts.pop();
      const firstName = parts.join(' ');
      authorStr = `${lastName}, ${firstName}`;
    } else if (authors.length === 2) {
      const first = authors[0].author?.display_name || 'Unknown';
      const second = authors[1].author?.display_name || 'Unknown';
      const firstParts = first.split(' ');
      const firstLast = firstParts.pop();
      const firstFirst = firstParts.join(' ');
      authorStr = `${firstLast}, ${firstFirst}, and ${second}`;
    } else {
      const first = authors[0].author?.display_name || 'Unknown';
      const parts = first.split(' ');
      const lastName = parts.pop();
      const firstName = parts.join(' ');
      authorStr = `${lastName}, ${firstName}, et al.`;
    }
  
    let citation = `${authorStr}. "${title}."`;
    if (journal) citation += ` *${journal}*,`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}.`;
  
    return citation;
  }
  
  function formatChicago(paper) {
    const authors = paper.authorships || [];
    const year = paper.publication_year || 'n.d.';
    const title = paper.title || 'Untitled';
    const journal = paper.primary_location?.source?.display_name || '';
    const doi = paper.doi || '';
  
    let authorStr = '';
    if (authors.length === 0) {
      authorStr = 'Unknown Author';
    } else if (authors.length === 1) {
      const name = authors[0].author?.display_name || 'Unknown';
      const parts = name.split(' ');
      const lastName = parts.pop();
      const firstName = parts.join(' ');
      authorStr = `${lastName}, ${firstName}`;
    } else if (authors.length <= 3) {
      authorStr = authors.map((a, i) => {
        const name = a.author?.display_name || 'Unknown';
        const parts = name.split(' ');
        const lastName = parts.pop();
        const firstName = parts.join(' ');
        if (i === 0) return `${lastName}, ${firstName}`;
        return `${firstName} ${lastName}`;
      }).join(', ').replace(/, ([^,]*)$/, ', and $1');
    } else {
      const first = authors[0].author?.display_name || 'Unknown';
      const parts = first.split(' ');
      const lastName = parts.pop();
      const firstName = parts.join(' ');
      authorStr = `${lastName}, ${firstName}, et al.`;
    }
  
    let citation = `${authorStr}. "${title}."`;
    if (journal) citation += ` *${journal}*`;
    citation += ` (${year}).`;
    if (doi) citation += ` ${doi}.`;
  
    return citation;
  }
