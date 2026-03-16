/** Shared test fixtures for data-query tests. */

export interface User {
  name: string;
  age: number;
  city: string;
  active: boolean;
  tags: string[];
  scores: { math: number; science: number };
  address?: { city: string; zip: string };
}

export function makeData(): User[] {
  return [
    {
      name: "Alice",
      age: 30,
      city: "Mumbai",
      active: true,
      tags: ["admin", "user"],
      scores: { math: 90, science: 85 },
      address: { city: "Mumbai", zip: "400001" },
    },
    {
      name: "Bob",
      age: 17,
      city: "Delhi",
      active: false,
      tags: ["user"],
      scores: { math: 70, science: 60 },
      address: { city: "Delhi", zip: "110001" },
    },
    {
      name: "Charlie",
      age: 25,
      city: "Mumbai",
      active: true,
      tags: ["admin"],
      scores: { math: 80, science: 95 },
      address: { city: "Mumbai", zip: "400002" },
    },
    {
      name: "Diana",
      age: 22,
      city: "Bangalore",
      active: false,
      tags: ["user", "moderator"],
      scores: { math: 95, science: 88 },
    },
    {
      name: "Eve",
      age: 35,
      city: "Delhi",
      active: true,
      tags: [],
      scores: { math: 60, science: 70 },
    },
  ];
}
