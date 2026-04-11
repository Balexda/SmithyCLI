import { Router, Request, Response } from 'express';
import { User, CreateUserRequest } from '../types';

const router = Router();

const users: User[] = [];
let nextId = 1;

// GET / — list all users
router.get('/', (_req: Request, res: Response) => {
  res.json(users);
});

// GET /:id — get user by id
router.get('/:id', (req: Request, res: Response) => {
  const user = users.find((u) => u.id === parseInt(req.params.id, 10));
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// POST / — create a new user
router.post('/', (req: Request<{}, {}, CreateUserRequest>, res: Response) => {
  const { name, email } = req.body;
  const user: User = { id: nextId++, name, email };
  users.push(user);
  res.status(201).json(user);
});

export default router;
