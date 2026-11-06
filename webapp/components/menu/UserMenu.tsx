'use client'

import {
  ArrowRightStartOnRectangleIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'

import { UserMenuProps } from './types'
import { useUserMenuLogic } from '../../hooks/menu/useUserMenuLogic'

export function UserMenu({ isLoggedIn, userName, walletAddress, isAdmin }: UserMenuProps) {
  const t = useTranslations()
  const { menuRef, displayName, isMenuOpen, toggleMenu, go, logout } = useUserMenuLogic({
    isLoggedIn,
    userName,
    walletAddress,
  })

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={toggleMenu}
        aria-expanded={isLoggedIn ? isMenuOpen : undefined}
        aria-label={isLoggedIn ? t('header.user_menu_alt') : t('header.login_alt')}
        className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 transition-all duration-300 hover:bg-[rgba(40,107,86,0.12)]"
      >
        <UserIcon className="h-6 w-6" aria-hidden="true" />
        <span className="max-w-28 truncate text-xs font-semibold">
          {isLoggedIn ? displayName || t('header.my_account') : t('header.login_alt')}
        </span>
      </button>

      {isLoggedIn && isMenuOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-[rgba(211,220,214,0.9)] bg-[rgba(248,248,248,0.96)] shadow-[0_18px_42px_rgba(12,35,26,0.18)] backdrop-blur-xl">
          <div className="py-1">
            <button onClick={go('/profile')} className="menu-item">
              <UserIcon className="h-5 w-5" />
              {t('user_menu.button_profile')}
            </button>

            {isAdmin && (
              <>
                <div className="mt-1 px-3 py-2">
                  <div className="mb-1.5 text-xs font-medium text-[rgba(150,150,150,0.8)]">
                    {t('user_menu.section_admin')}
                  </div>
                  <div className="h-px bg-[rgba(150,150,150,0.3)]" />
                </div>
                <button onClick={go('/admin/users')} className="menu-item">
                  <ShieldCheckIcon className="h-5 w-5" />
                  {t('user_menu.manage_users')}
                </button>
                <button onClick={go('/admin/farmers')} className="menu-item">
                  <UserGroupIcon className="h-5 w-5" />
                  {t('user_menu.manage_farmers')}
                </button>
              </>
            )}

            <button onClick={logout} className="menu-item menu-item-danger mt-2">
              <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
              {t('user_menu.button_logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
