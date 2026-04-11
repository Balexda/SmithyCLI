import express from 'express';
import usersRouter from './routes/users';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/users', usersRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
