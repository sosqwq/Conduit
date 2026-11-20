export interface Profile {
  username: string
  bio: string | null
  image: string | null
  following: boolean
}

export interface User {
  username: string
  email: string
  bio: string | null
  image: string | null
  token: string
}

export interface ArticleSummary {
  slug: string
  title: string
  description: string
  tagList: string[]
  createdAt: string
  updatedAt: string
  favorited: boolean
  favoritesCount: number
  author: Profile
}

export interface Article extends ArticleSummary {
  body: string
}

export interface ArticleList {
  articles: ArticleSummary[]
  articlesCount: number
}

export interface Comment {
  id: number
  body: string
  createdAt: string
  updatedAt: string
  author: Profile
}
