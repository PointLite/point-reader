export type WebDavEntry = {
  name: string;
  href: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
};

export type WebDavDirectory = {
  id: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  createdAt: number;
  updatedAt: number;
};
