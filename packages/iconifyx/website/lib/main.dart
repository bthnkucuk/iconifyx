import 'package:flutter/widgets.dart';
import 'package:zentoast/zentoast.dart';

import 'bootstrap/bootstrap_app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // ToastProvider holds the live toast stack via a reactive list and
  // must wrap the MaterialApp so every page can `Toast(...).show(context)`
  // — see lib/shared/toast/app_toast.dart for the typed facade.
  runApp(ToastProvider.create(child: const BootstrapApp()));
}
