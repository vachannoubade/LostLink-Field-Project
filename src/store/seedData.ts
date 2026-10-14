import type { Report, User, Notification } from '../types';

export const demoUser: User = {
  id: 'u_1',
  name: 'Alex Johnson',
  email: 'alex.j@fictional.edu'
};

export const initialNotifications: Notification[] = [
  {
    id: 'n_1',
    userId: 'u_1',
    title: 'Potential Match Alert',
    message: 'A potential match was detected for your reported "Blue Hydro Flask".',
    read: false,
    createdAt: '2023-10-10T09:30:00Z',
    link: '/items/r_3'
  },
  {
    id: 'n_2',
    userId: 'u_1',
    title: 'Welcome to LostLink',
    message: 'Welcome to campus Lost & Found. You can report items or search existing campus listings.',
    read: true,
    createdAt: '2023-10-08T10:00:00Z',
    link: '/browse'
  }
];

export const initialReports: Report[] = [
  {
    id: 'r_1',
    type: 'lost',
    title: 'Black Wireless Earbuds',
    category: 'Electronics',
    description: 'Lost my black Sony earbuds in a black charging case. Left them somewhere near the Main Library entrance on a bench.',
    location: 'Main Library',
    date: '2023-10-09',
    status: 'lost',
    userId: 'u_2',
    createdAt: '2023-10-09T14:30:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&q=80'
  },
  {
    id: 'r_2',
    type: 'found',
    title: 'Sony Earbuds Case',
    category: 'Electronics',
    description: 'Found black bluetooth earbuds outside the library on a stone bench. Handed them to the front desk.',
    location: 'Main Library',
    date: '2023-10-09',
    status: 'found',
    userId: 'u_3',
    createdAt: '2023-10-09T16:45:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&q=80'
  },
  {
    id: 'r_3',
    type: 'lost',
    title: 'Blue Hydro Flask',
    category: 'Accessories',
    description: 'Dark blue water bottle with a few laptop stickers. Left in Room 402 of the Science Building.',
    location: 'Science Building',
    date: '2023-10-08',
    status: 'lost',
    userId: 'u_1', // belongs to current demo user
    createdAt: '2023-10-08T10:15:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&q=80'
  },
  {
    id: 'r_4',
    type: 'found',
    title: 'Student ID - Sarah Smith',
    category: 'ID Cards',
    description: 'Found an ID card near the dining hall entrance.',
    location: 'Dining Hall',
    date: '2023-10-10',
    status: 'found',
    userId: 'u_4',
    createdAt: '2023-10-10T08:20:00Z'
  },
  {
    id: 'r_5',
    type: 'lost',
    title: 'MacBook Pro Charger',
    category: 'Electronics',
    description: 'Apple USB-C charger block and cable.',
    location: 'Student Union',
    date: '2023-10-07',
    status: 'lost',
    userId: 'u_5',
    createdAt: '2023-10-07T11:00:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&q=80'
  }
];
