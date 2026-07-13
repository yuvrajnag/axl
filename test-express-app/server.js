const express = require('express');
const app = express();
app.use(express.json());

// In-memory data store for Books
const books = [];
let nextId = 1;

app.get('/api/books', (req, res) => {
  res.json(books);
});

app.post('/api/books', (req, res) => {
  const { title, author, year } = req.body;
  const newBook = { id: String(nextId++), title, author, year };
  books.push(newBook);
  res.status(201).json(newBook);
});

app.listen(3000, () => {
  console.log('Book server running on port 3000');
});
