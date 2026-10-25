import {
  Button,
  Header as CarbonHeader,
  HeaderContainer,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  HeaderSideNavItems,
  SideNav,
  SideNavItems,
  SkipToContent,
  Tag,
} from "@carbon/react";
import { Logout, UserAvatar } from "@carbon/icons-react";
import { Link } from "@tanstack/react-router";
import useAuth from "../../hooks/useAuth";
import ThemeSwitcher from "./ThemeSwitcher";

// Map IBM Verify groups (see scripts/vault: readonly / readwrite) to a demo-friendly role
const getRole = (groups: string[] = []) => {
  const g = groups.map((x) => x.toLowerCase());
  if (g.includes("readwrite")) return { label: "Read-Write", type: "green" };
  if (g.includes("readonly")) return { label: "Read-Only", type: "blue" };
  return { label: "No role", type: "gray" };
};

export function Header() {
  const { logout, user } = useAuth();

  const displayName =
    user?.preferred_username || user?.full_name || user?.email || "User";
  const role = getRole(user?.groups);

  const navItems: {
    title: string;
    path: string;
  }[] = [
    { title: "Agent", path: "/" },
    { title: "Feedback", path: "/feedback" },
    { title: "Admin", path: "/admin" },
  ];

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }: any) => (
        <>
          <CarbonHeader aria-label="Secure AI Agents">
            <SkipToContent />
            <HeaderMenuButton
              aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
              aria-expanded={isSideNavExpanded}
            />

            <HeaderName href="/" prefix="IBM">
              Secure AI Agents
            </HeaderName>
            <HeaderNavigation
              aria-label="Secure AI Agents"
              className="hidden lg:flex"
            >
              {navItems.map((item) => (
                <HeaderMenuItem as={Link} key={item.title} to={item.path}>
                  {item.title}
                </HeaderMenuItem>
              ))}
            </HeaderNavigation>
            <HeaderGlobalBar>
              {user && (
                <div
                  className="hidden items-center gap-2 pr-2 md:flex"
                  data-testid="current-user"
                >
                  <UserAvatar size={20} />
                  <span className="text-sm font-semibold">{displayName}</span>
                  <Tag type={role.type as any} size="sm" className="m-0">
                    {role.label}
                  </Tag>
                </div>
              )}
              <ThemeSwitcher />
              <Button
                kind="ghost"
                size="lg"
                renderIcon={Logout}
                onClick={logout}
                data-testid="logout-button"
              >
                Log out
              </Button>
            </HeaderGlobalBar>
            <SideNav
              aria-label="Side navigation"
              expanded={isSideNavExpanded}
              isPersistent={false}
              onSideNavBlur={onClickSideNavExpand}
            >
              <SideNavItems>
                <HeaderSideNavItems>
                  {navItems.map((item) => (
                    <HeaderMenuItem key={item.title} href={item.path}>
                      {item.title}
                    </HeaderMenuItem>
                  ))}
                  <HeaderMenuItem href="/settings">
                    User Settings
                  </HeaderMenuItem>
                </HeaderSideNavItems>
              </SideNavItems>
            </SideNav>
          </CarbonHeader>
        </>
      )}
    />
  );
}
