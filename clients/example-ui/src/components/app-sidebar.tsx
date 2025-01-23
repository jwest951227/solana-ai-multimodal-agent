import * as React from "react";
import { Bot, MessageSquare } from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  user: {
    name: "sleever",
    email: "m@sleever.ai",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "sleever",
      logo: Bot,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Agents",
      url: "#",
      icon: Bot,
      isActive: true,
      items: [
        {
          title: "My Agents",
          url: "#",
        },
        {
          title: "Create Agent",
          url: "#",
        },
        {
          title: "Settings",
          url: "#",
        },
      ],
    },
    {
      title: "Chats",
      url: "#",
      icon: MessageSquare,
      items: [
        {
          title: "History",
          url: "#",
        },
        {
          title: "Saved",
          url: "#",
        },
        {
          title: "Settings",
          url: "#",
        },
      ],
    },
  ],
  projects: [],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
