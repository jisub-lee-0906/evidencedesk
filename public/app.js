const form = document.querySelector('#ask-form');
const question = document.querySelector('#q');
const button = document.querySelector('#ask');
const status = document.querySelector('#status');
const answer = document.querySelector('#answer');
const evidence = document.querySelector('#evidence');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '검색 중...';
  answer.textContent = '';
  evidence.replaceChildren();
  try {
    const response = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: question.value }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    status.textContent = `응답 방식: ${data.mode}`;
    answer.textContent = data.answer;
    data.evidence.forEach((item) => {
      const row = document.createElement('li');
      row.textContent = `[${item.sourceId}] ${item.title}: ${item.excerpt}`;
      evidence.append(row);
    });
  } catch (error) { status.textContent = `오류: ${error.message}`; }
  finally { button.disabled = false; }
});