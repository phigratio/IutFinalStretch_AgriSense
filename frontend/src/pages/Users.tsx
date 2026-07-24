import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import UsersTable from "../components/tables/UsersTable.js";

export default function Users() {
  return (
    <>
      <PageMeta title="Users · ICT Fest Admin" description="Manage users" />
      <PageBreadcrumb pageTitle="Users" />
      <UsersTable />
    </>
  );
}
