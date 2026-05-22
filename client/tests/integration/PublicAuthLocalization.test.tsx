import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { LandingPage } from '@/features/public/pages/LandingPage'

describe('public and auth localization', () => {
  it('renders the landing page with Russian primary copy and actions', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('link', { name: 'Войти' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Начать' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Начать бесплатно' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Диспетчеризация/ })).toBeInTheDocument()
    expect(screen.getByText('Живая телеметрия')).toBeInTheDocument()
    expect(screen.getByText('Простые тарифы для MVP')).toBeInTheDocument()
  })

  it('renders the login page with Russian labels and actions', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Войдите в аккаунт')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Зарегистрироваться' })).toBeInTheDocument()
  })

  it('renders the register page with Russian labels and validation actions', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Создание аккаунта' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Пароль (минимум 8 символов)')).toBeInTheDocument()
    expect(screen.getByLabelText('Повторите пароль')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Зарегистрироваться' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Войти' })).toBeInTheDocument()
  })
})
