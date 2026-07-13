const express = require('express');
const app = express();

app.use(express.json());

const products = [];
let nextId = 1;

app.post('/api/products', (req, res) => {
  const { name, price } = req.body;
  const product = { id: nextId++, name, price };
  products.push(product);
  res.status(201).json(product);
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.listen(3000, () => console.log('Server running on port 3000'));
