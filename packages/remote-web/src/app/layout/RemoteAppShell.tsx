import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { siDiscord, siGithub } from "simple-icons";
import { XIcon, PlusIcon, HouseIcon, KanbanIcon } from "@phosphor-icons/react";
import { AppBar } from "@vibe/ui/components/AppBar";
import { MobileDrawer } from "@vibe/ui/components/MobileDrawer";
import type { Project } from "shared/remote-types";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { cn } from "@/shared/lib/utils";
import { useUserOrganizations } from "@/shared/hooks/useUserOrganizations";
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { useOrganizationStore } from "@/shared/stores/useOrganizationStore";
import { useDiscordOnlineCount } from "@/shared/hooks/useDiscordOnlineCount";
import { useGitHubStars } from "@/shared/hooks/useGitHubStars";
import { listOrganizationProjects } from "@remote/shared/lib/api";
import { RemoteAppBarUserPopoverContainer } from "@remote/app/layout/RemoteAppBarUserPopoverContainer";
import { RemoteNavbarContainer } from "@remote/app/layout/RemoteNavbarContainer";
import {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from "@/shared/dialogs/org/CreateOrganizationDialog";
import {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectResult,
} from "@/shared/dialogs/org/CreateRemoteProjectDialog";

interface RemoteAppShellProps {
  children: ReactNode;
}

export function RemoteAppShell({ children }: RemoteAppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { data: organizationsData } = useUserOrganizations();
  const organizations = organizationsData?.organizations ?? [];
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  useEffect(() => {
    if (organizations.length === 0) {
      return;
    }

    const hasValidSelection = selectedOrgId
      ? organizations.some((organization) => organization.id === selectedOrgId)
      : false;

    if (!hasValidSelection) {
      const firstOrg = organizations.find(
        (organization) => !organization.is_personal,
      );
      setSelectedOrgId((firstOrg ?? organizations[0]).id);
    }
  }, [organizations, selectedOrgId, setSelectedOrgId]);

  const activeOrganizationId = useMemo(() => {
    if (!selectedOrgId) {
      return organizations[0]?.id ?? null;
    }

    const isSelectedOrgAvailable = organizations.some(
      (organization) => organization.id === selectedOrgId,
    );

    if (!isSelectedOrgAvailable) {
      return organizations[0]?.id ?? null;
    }

    return selectedOrgId;
  }, [organizations, selectedOrgId]);

  const projectsQuery = useQuery({
    queryKey: ["remote-app-shell", "projects", activeOrganizationId],
    queryFn: async (): Promise<Project[]> => {
      if (!activeOrganizationId) {
        return [];
      }

      const projects = await listOrganizationProjects(activeOrganizationId);
      return [...projects].sort((a, b) => a.sort_order - b.sort_order);
    },
    enabled: isSignedIn && !!activeOrganizationId,
    staleTime: 30_000,
  });

  const projects = projectsQuery.data ?? [];
  const isLoadingProjects =
    isSignedIn && !!activeOrganizationId && projectsQuery.isLoading;

  const { data: onlineCount } = useDiscordOnlineCount();
  const { data: starCount } = useGitHubStars();

  const selectedOrgName =
    organizations.find((organization) => organization.id === selectedOrgId)
      ?.name ?? null;

  const isWorkspacesActive = location.pathname.startsWith("/workspaces");
  const activeProjectId = location.pathname.startsWith("/projects/")
    ? (location.pathname.split("/")[2] ?? null)
    : null;

  const handleWorkspacesClick = useCallback(() => {
    navigate({ to: "/workspaces" });
  }, [navigate]);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate({
        to: "/projects/$projectId",
        params: { projectId },
      });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }

    try {
      const result: CreateRemoteProjectResult =
        await CreateRemoteProjectDialog.show({
          organizationId: activeOrganizationId,
        });

      if (result.action === "created" && result.project) {
        void projectsQuery.refetch();
        navigate({
          to: "/projects/$projectId",
          params: { projectId: result.project.id },
        });
      }
    } catch {
      // Dialog cancelled
    }
  }, [activeOrganizationId, navigate, projectsQuery]);

  const handleCreateOrg = useCallback(async () => {
    try {
      const result: CreateOrganizationResult =
        await CreateOrganizationDialog.show();

      if (result.action === "created" && result.organizationId) {
        setSelectedOrgId(result.organizationId);
      }
    } catch {
      // Dialog cancelled
    }
  }, [setSelectedOrgId]);

  const mobileUserSlot = useMemo(() => {
    if (!isMobile) return undefined;
    return (
      <RemoteAppBarUserPopoverContainer
        organizations={organizations}
        selectedOrgId={selectedOrgId ?? ""}
        onOrgSelect={setSelectedOrgId}
        onCreateOrg={handleCreateOrg}
      />
    );
  }, [
    isMobile,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    handleCreateOrg,
  ]);

  return (
    <div
      className={cn(
        "flex bg-primary",
        isMobile
          ? "fixed inset-0 pb-[env(safe-area-inset-bottom)]"
          : "h-screen",
      )}
    >
      {!isMobile && (
        <AppBar
          projects={projects}
          onCreateProject={handleCreateProject}
          onWorkspacesClick={handleWorkspacesClick}
          showWorkspacesButton={false}
          onProjectClick={handleProjectClick}
          onProjectsDragEnd={() => {}}
          isSavingProjectOrder={true}
          isWorkspacesActive={isWorkspacesActive}
          activeProjectId={activeProjectId}
          isSignedIn={isSignedIn}
          isLoadingProjects={isLoadingProjects}
          onSignIn={() => {
            navigate({ to: "/account" });
          }}
          userPopover={
            <RemoteAppBarUserPopoverContainer
              organizations={organizations}
              selectedOrgId={selectedOrgId ?? ""}
              onOrgSelect={setSelectedOrgId}
              onCreateOrg={handleCreateOrg}
            />
          }
          starCount={starCount}
          onlineCount={onlineCount}
          githubIconPath={siGithub.path}
          discordIconPath={siDiscord.path}
        />
      )}
      <MobileDrawer
        open={isDrawerOpen && isMobile}
        onClose={() => setIsDrawerOpen(false)}
      >
        <div className="flex flex-col h-full">
          {/* Header: org name + close button */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <span className="text-sm font-medium text-high truncate">
              {selectedOrgName ?? "Organization"}
            </span>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="p-1 rounded-sm text-low hover:text-normal cursor-pointer"
            >
              <XIcon className="h-4 w-4" weight="bold" />
            </button>
          </div>

          {/* Home link */}
          <button
            type="button"
            onClick={() => {
              navigate({ to: "/" });
              setIsDrawerOpen(false);
            }}
            className="flex items-center gap-2 px-4 py-3 text-sm text-normal hover:bg-secondary cursor-pointer"
          >
            <HouseIcon className="h-4 w-4" />
            Home
          </button>

          {/* Divider */}
          <div className="mx-3 border-t border-border" />

          {/* Project list */}
          <div className="flex-1 overflow-y-auto p-2">
            {isSignedIn ? (
              isLoadingProjects ? (
                <p className="px-3 py-4 text-sm text-low">Loading projects…</p>
              ) : (
                projects.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    onClick={() => {
                      handleProjectClick(project.id);
                      setIsDrawerOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-left cursor-pointer",
                      "transition-colors",
                      project.id === activeProjectId
                        ? "bg-brand/10 text-high"
                        : "text-normal hover:bg-secondary",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${project.color})` }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))
              )
            ) : (
              <div className="px-4 py-6 text-center">
                <KanbanIcon
                  className="h-8 w-8 mx-auto text-low"
                  weight="bold"
                />
                <p className="mt-3 text-sm font-medium text-high">
                  Kanban Boards
                </p>
                <p className="mt-1 text-xs text-low">
                  Sign in to organise your coding agents with kanban boards.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      navigate({ to: "/account" });
                      setIsDrawerOpen(false);
                    }}
                    className="w-full px-3 py-2 rounded-md text-sm font-medium bg-brand text-on-brand hover:bg-brand-hover cursor-pointer"
                  >
                    Sign in
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Create Project button */}
          {isSignedIn && (
            <div className="p-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  handleCreateProject();
                  setIsDrawerOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm text-low hover:text-normal hover:bg-secondary cursor-pointer"
              >
                <PlusIcon className="h-4 w-4" />
                Create Project
              </button>
            </div>
          )}
        </div>
      </MobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <RemoteNavbarContainer
          organizationName={selectedOrgName}
          mobileMode={isMobile}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          mobileUserSlot={mobileUserSlot}
        />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
