      (function () {
        var path = location.pathname.replace(/\/+$/, "") || "/member";
        var map = {
          "/register": "registerScreen",
          "/staff": "loginScreenStaff",
          "/admin": "loginScreenAdmin",
          "/platform": "loginScreenPlatform",
          "/member": "loginScreenMember"
        };
        var el = document.getElementById(map[path] || "loginScreenMember");
        if (el) el.classList.remove("hidden");
      })();
